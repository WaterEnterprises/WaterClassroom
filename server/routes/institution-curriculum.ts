import { Hono } from "hono";
import { getDb, loadK12CurriculumFiles } from "../db";
import { getSessionToken, validateSession } from "../session";
import { saveUploadedGame } from "../class-materializer";
import { writeLessonBody, readLessonBody, deleteLessonDir, withLessonBody } from "../lesson-files";
import crypto from "crypto";

// ═══════════════════════════════════════════════════════════════
// Institution curriculum — every institution manages its OWN classes,
// customizes its curriculum, manages enrolled students per class,
// and shares a student signup code. No system permission required.
// ═══════════════════════════════════════════════════════════════

function safeParseJsonArray(value: any): any[] {
  if (Array.isArray(value)) return value;
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}

export function normalizeCountryCode(input: unknown): string {
  const code = String(input || "").trim().toUpperCase();
  if (code === "GLOBAL") return "GLOBAL";
  if (/^[A-Z]{2}$/.test(code)) return code;
  return "";
}

function newCode(prefix: string): string {
  // e.g. WC-7F3K2M — unambiguous charset (no I, L, O, 0, 1)
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += alphabet[crypto.randomInt(alphabet.length)];
  return `${prefix}-${code}`;
}

async function requireInstitutionUser(c: any) {
  const token = getSessionToken(c);
  const session = await validateSession(token);
  if (!session) return { error: c.json({ error: "Unauthorized" }, 401) };
  const userRes = await getDb().execute({ sql: "SELECT * FROM turso_records WHERE id = ?", args: [session.userId] });
  if (userRes.rows.length === 0) return { error: c.json({ error: "User not found" }, 404) };
  const user = userRes.rows[0] as any;
  if (user.type !== "Institution") return { error: c.json({ error: "Forbidden — institution account required" }, 403) };
  return { user };
}

export const institutionCurriculumRoutes = new Hono();

// ─── Game upload (shared with the system Studio) ───

institutionCurriculumRoutes.post("/upload-game", async (c) => {
  const auth = await requireInstitutionUser(c);
  if (auth.error) return auth.error;
  try {
    const formData = await c.req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) return c.json({ error: "file field is required" }, 400);
    const saved = await saveUploadedGame(file);
    return c.json(saved, 201);
  } catch (err: any) {
    return c.json({ error: err.message || "Upload failed" }, 400);
  }
});

// ─── Student signup code (per-institution, shared by all its classes) ───

institutionCurriculumRoutes.get("/student-code", async (c) => {
  const auth = await requireInstitutionUser(c);
  if (auth.error) return auth.error;
  let code = (auth.user as any).affiliatedCode as string;
  if (!code) {
    code = newCode("WI");
    await getDb().execute({ sql: "UPDATE turso_records SET affiliatedCode = ? WHERE id = ?", args: [code, auth.user.id] });
  }
  return c.json({ student_code: code });
});

institutionCurriculumRoutes.post("/student-code/regenerate", async (c) => {
  const auth = await requireInstitutionUser(c);
  if (auth.error) return auth.error;
  const code = newCode("WI");
  await getDb().execute({ sql: "UPDATE turso_records SET affiliatedCode = ? WHERE id = ?", args: [code, auth.user.id] });
  return c.json({ student_code: code });
});

// ─── Own tracks (customized curriculum) ───

institutionCurriculumRoutes.get("/tracks", async (c) => {
  const auth = await requireInstitutionUser(c);
  if (auth.error) return auth.error;
  const res = await getDb().execute({
    sql: `SELECT t.*, (SELECT COUNT(*) FROM admin_classes cl WHERE cl.track_id = t.id) AS class_count
          FROM admin_tracks t WHERE t.institution_id = ? ORDER BY t.created_at DESC`,
    args: [auth.user.id],
  });
  return c.json({ tracks: res.rows });
});

institutionCurriculumRoutes.post("/tracks", async (c) => {
  const auth = await requireInstitutionUser(c);
  if (auth.error) return auth.error;
  const { name, description, grade_level, subject, country_code } = await c.req.json();
  if (!name?.trim()) return c.json({ error: "Track name is required" }, 400);
  const id = `track-inst-${Date.now()}`;
  const now = new Date().toISOString();
  // Default to the institution's own country so the track is discoverable in the library.
  const country = normalizeCountryCode(country_code) || (auth.user as any).country || "GLOBAL";
  await getDb().execute({
    sql: `INSERT INTO admin_tracks (id, institution_id, name, description, grade_level, subject, country_code, is_published, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    args: [id, auth.user.id, name.trim(), description || "", grade_level || "all", subject || "General", country, now],
  });
  return c.json({ id, name: name.trim(), description: description || "", grade_level: grade_level || "all", subject: subject || "General", country_code: country }, 201);
});

institutionCurriculumRoutes.put("/tracks/:id", async (c) => {
  const auth = await requireInstitutionUser(c);
  if (auth.error) return auth.error;
  const id = c.req.param("id");
  const existing = await getDb().execute({ sql: "SELECT * FROM admin_tracks WHERE id = ? AND institution_id = ?", args: [id, auth.user.id] });
  if (existing.rows.length === 0) return c.json({ error: "Track not found" }, 404);
  const row = existing.rows[0] as any;
  const { name, description, grade_level, subject, country_code } = await c.req.json();
  await getDb().execute({
    sql: `UPDATE admin_tracks SET name = ?, description = ?, grade_level = ?, subject = ?, country_code = ? WHERE id = ?`,
    args: [
      String(name || "").trim() || row.name,
      description ?? row.description,
      grade_level ?? row.grade_level,
      subject ?? row.subject,
      normalizeCountryCode(country_code) || row.country_code || "GLOBAL",
      id,
    ],
  });
  const updated = (await getDb().execute({ sql: "SELECT * FROM admin_tracks WHERE id = ?", args: [id] })).rows[0];
  return c.json(updated);
});

institutionCurriculumRoutes.delete("/tracks/:id", async (c) => {
  const auth = await requireInstitutionUser(c);
  if (auth.error) return auth.error;
  const id = c.req.param("id");
  const own = await getDb().execute({ sql: "SELECT id FROM admin_tracks WHERE id = ? AND institution_id = ?", args: [id, auth.user.id] });
  if (own.rows.length === 0) return c.json({ error: "Track not found" }, 404);
  const classes = await getDb().execute({ sql: "SELECT id FROM admin_classes WHERE track_id = ?", args: [id] });
  for (const row of classes.rows) {
    deleteLessonDir((row as any).id);
  }
  await getDb().execute({ sql: "DELETE FROM class_enrollments WHERE class_id IN (SELECT id FROM admin_classes WHERE track_id = ?)", args: [id] });
  await getDb().execute({ sql: "DELETE FROM admin_classes WHERE track_id = ?", args: [id] });
  await getDb().execute({ sql: "DELETE FROM admin_track_grades WHERE track_id = ?", args: [id] });
  await getDb().execute({ sql: "DELETE FROM admin_courses WHERE track_id = ?", args: [id] });
  await getDb().execute({ sql: "DELETE FROM admin_tracks WHERE id = ?", args: [id] });
  return c.json({ success: true });
});

// ─── Courses inside a grade (track → grade → course → lesson) ───

institutionCurriculumRoutes.get("/tracks/:id/courses", async (c) => {
  const auth = await requireInstitutionUser(c);
  if (auth.error) return auth.error;
  const trackId = c.req.param("id");
  const own = await getDb().execute({ sql: "SELECT id FROM admin_tracks WHERE id = ? AND institution_id = ?", args: [trackId, auth.user.id] });
  if (own.rows.length === 0) return c.json({ error: "Track not found" }, 404);
  const res = await getDb().execute({
    sql: `SELECT c.*,
            (SELECT COUNT(*) FROM admin_classes cl WHERE cl.course_id = c.id) AS lesson_count
          FROM admin_courses c WHERE c.track_id = ? ORDER BY c.sort_order ASC, c.created_at ASC`,
    args: [trackId],
  });
  return c.json({ courses: res.rows });
});

institutionCurriculumRoutes.post("/tracks/:id/courses", async (c) => {
  const auth = await requireInstitutionUser(c);
  if (auth.error) return auth.error;
  const trackId = c.req.param("id");
  const own = await getDb().execute({ sql: "SELECT id FROM admin_tracks WHERE id = ? AND institution_id = ?", args: [trackId, auth.user.id] });
  if (own.rows.length === 0) return c.json({ error: "Track not found" }, 404);
  const { name, description, subject, grade_id } = await c.req.json();
  if (!String(name || "").trim()) return c.json({ error: "Course name is required" }, 400);
  if (!grade_id) return c.json({ error: "grade_id is required — courses live inside a grade" }, 400);
  const grade = await getDb().execute({ sql: "SELECT id FROM admin_track_grades WHERE id = ? AND track_id = ?", args: [grade_id, trackId] });
  if (grade.rows.length === 0) return c.json({ error: "Grade not found in this track" }, 404);
  const count = await getDb().execute({ sql: "SELECT COUNT(*) AS n FROM admin_courses WHERE track_id = ?", args: [trackId] });
  const id = `course-${crypto.randomBytes(5).toString("hex")}`;
  const now = new Date().toISOString();
  await getDb().execute({
    sql: `INSERT INTO admin_courses (id, track_id, institution_id, grade_id, name, description, subject, sort_order, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [id, trackId, auth.user.id, grade_id, String(name).trim(), description || "", subject || "General", (count.rows[0] as any).n || 0, now],
  });
  return c.json({ id, track_id: trackId, grade_id, name: String(name).trim(), description: description || "", subject: subject || "General", lesson_count: 0 }, 201);
});

institutionCurriculumRoutes.put("/courses/:id", async (c) => {
  const auth = await requireInstitutionUser(c);
  if (auth.error) return auth.error;
  const id = c.req.param("id");
  const existing = await getDb().execute({ sql: "SELECT * FROM admin_courses WHERE id = ? AND institution_id = ?", args: [id, auth.user.id] });
  if (existing.rows.length === 0) return c.json({ error: "Course not found" }, 404);
  const row = existing.rows[0] as any;
  const { name, description, subject, grade_id } = await c.req.json();
  let nextGradeId = row.grade_id || "";
  if (grade_id !== undefined) {
    if (grade_id) {
      const grade = await getDb().execute({ sql: "SELECT id FROM admin_track_grades WHERE id = ? AND track_id = ?", args: [grade_id, row.track_id] });
      if (grade.rows.length === 0) return c.json({ error: "Grade not found in this track" }, 404);
      nextGradeId = grade_id;
    } else {
      nextGradeId = "";
    }
  }
  await getDb().execute({
    sql: `UPDATE admin_courses SET name = ?, description = ?, subject = ?, grade_id = ? WHERE id = ?`,
    args: [String(name || "").trim() || row.name, description ?? row.description, subject ?? row.subject, nextGradeId, id],
  });
  if (nextGradeId !== (row.grade_id || "")) {
    // Lessons follow their course into the new grade.
    await getDb().execute({ sql: "UPDATE admin_classes SET grade_id = ? WHERE course_id = ?", args: [nextGradeId, id] });
  }
  return c.json({ success: true });
});

institutionCurriculumRoutes.delete("/courses/:id", async (c) => {
  const auth = await requireInstitutionUser(c);
  if (auth.error) return auth.error;
  const id = c.req.param("id");
  const own = await getDb().execute({ sql: "SELECT id FROM admin_courses WHERE id = ? AND institution_id = ?", args: [id, auth.user.id] });
  if (own.rows.length === 0) return c.json({ error: "Course not found" }, 404);
  // Non-destructive: lessons stay in the grade, detached from the course.
  await getDb().execute({ sql: "UPDATE admin_classes SET course_id = '' WHERE course_id = ?", args: [id] });
  await getDb().execute({ sql: "DELETE FROM admin_courses WHERE id = ?", args: [id] });
  return c.json({ success: true });
});

// ─── Grades inside a track (tracks → grades → lessons) ───

institutionCurriculumRoutes.get("/tracks/:id/grades", async (c) => {
  const auth = await requireInstitutionUser(c);
  if (auth.error) return auth.error;
  const trackId = c.req.param("id");
  const own = await getDb().execute({ sql: "SELECT id FROM admin_tracks WHERE id = ? AND institution_id = ?", args: [trackId, auth.user.id] });
  if (own.rows.length === 0) return c.json({ error: "Track not found" }, 404);
  const res = await getDb().execute({
    sql: `SELECT g.*, (SELECT COUNT(*) FROM admin_classes cl WHERE cl.grade_id = g.id) AS lesson_count
          FROM admin_track_grades g WHERE g.track_id = ? ORDER BY g.sort_order ASC, g.grade_level ASC`,
    args: [trackId],
  });
  return c.json({ grades: res.rows });
});

institutionCurriculumRoutes.post("/tracks/:id/grades", async (c) => {
  const auth = await requireInstitutionUser(c);
  if (auth.error) return auth.error;
  const trackId = c.req.param("id");
  const own = await getDb().execute({ sql: "SELECT id FROM admin_tracks WHERE id = ? AND institution_id = ?", args: [trackId, auth.user.id] });
  if (own.rows.length === 0) return c.json({ error: "Track not found" }, 404);
  const { grade_level, label } = await c.req.json();
  if (!String(grade_level || "").trim()) return c.json({ error: "grade_level is required" }, 400);
  const count = await getDb().execute({ sql: "SELECT COUNT(*) AS n FROM admin_track_grades WHERE track_id = ?", args: [trackId] });
  const id = `grade-${crypto.randomBytes(5).toString("hex")}`;
  const now = new Date().toISOString();
  await getDb().execute({
    sql: `INSERT INTO admin_track_grades (id, track_id, institution_id, grade_level, label, sort_order, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [id, trackId, auth.user.id, String(grade_level).trim(), label || `Grade ${String(grade_level).trim()}`, (count.rows[0] as any).n || 0, now],
  });
  return c.json({ id, track_id: trackId, grade_level: String(grade_level).trim(), label: label || `Grade ${String(grade_level).trim()}`, lesson_count: 0 }, 201);
});

institutionCurriculumRoutes.put("/grades/:id", async (c) => {
  const auth = await requireInstitutionUser(c);
  if (auth.error) return auth.error;
  const id = c.req.param("id");
  const existing = await getDb().execute({ sql: "SELECT * FROM admin_track_grades WHERE id = ? AND institution_id = ?", args: [id, auth.user.id] });
  if (existing.rows.length === 0) return c.json({ error: "Grade not found" }, 404);
  const row = existing.rows[0] as any;
  const { label, grade_level } = await c.req.json();
  const nextLevel = String(grade_level || "").trim() || row.grade_level;
  await getDb().execute({
    sql: `UPDATE admin_track_grades SET label = ?, grade_level = ? WHERE id = ?`,
    args: [String(label || "").trim() || row.label, nextLevel, id],
  });
  const updated = (await getDb().execute({ sql: "SELECT * FROM admin_track_grades WHERE id = ?", args: [id] })).rows[0];
  return c.json(updated);
});

institutionCurriculumRoutes.delete("/grades/:id", async (c) => {
  const auth = await requireInstitutionUser(c);
  if (auth.error) return auth.error;
  const id = c.req.param("id");
  const own = await getDb().execute({ sql: "SELECT id, track_id FROM admin_track_grades WHERE id = ? AND institution_id = ?", args: [id, auth.user.id] });
  if (own.rows.length === 0) return c.json({ error: "Grade not found" }, 404);
  // Keep everything — lessons stay with their course (or become ungrouped), courses become unassigned. Nothing is lost.
  await getDb().execute({ sql: "UPDATE admin_classes SET grade_id = '' WHERE grade_id = ?", args: [id] });
  await getDb().execute({ sql: "UPDATE admin_courses SET grade_id = '' WHERE grade_id = ?", args: [id] });
  await getDb().execute({ sql: "DELETE FROM admin_track_grades WHERE id = ?", args: [id] });
  return c.json({ success: true });
});

// ─── Water library: every track in the Water database can be imported ───
// Sources: the built-in Water K-12 curriculum + all published system tracks.

function sortGradeLevels(levels: Array<string | number>): string[] {
  return [...new Set(levels.map(String))].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
}

institutionCurriculumRoutes.get("/water-tracks", async (c) => {
  const auth = await requireInstitutionUser(c);
  if (auth.error) return auth.error;
  const library: Array<any> = [];
  // 1. Water-owned tracks in the database (seeded + curated in the global Studio).
  const sysRes = await getDb().execute({
    sql: `SELECT t.id, t.name, t.description, t.subject, t.country_code, COALESCE(u.name, 'Water') AS institution_name,
            (SELECT COUNT(*) FROM admin_track_grades g WHERE g.track_id = t.id) AS grade_count,
            (SELECT COUNT(*) FROM admin_courses co WHERE co.track_id = t.id) AS course_count,
            (SELECT COUNT(*) FROM admin_classes cl WHERE cl.track_id = t.id AND cl.is_published = 1) AS lesson_count
          FROM admin_tracks t LEFT JOIN turso_records u ON u.id = t.institution_id
          WHERE t.is_published = 1 AND t.institution_id <> ?
          ORDER BY t.created_at DESC`,
    args: [auth.user.id],
  });
  for (const row of sysRes.rows as any[]) {
    library.push({ ...row, source: "system" });
  }
  // 2. Fallback: built-in Water K-12 files, only when the database has no
  // Water-owned tracks yet (e.g. seed files missing at boot).
  const hasWaterDbTracks = library.some((t) => t.institution_name === "Water");
  if (!hasWaterDbTracks) {
    const files = loadK12CurriculumFiles();
    if (files.length > 0) {
      const allGrades = sortGradeLevels(files.flatMap((f) => f.lessons.map((l) => l.grade)));
      library.unshift({
      id: "water-k12",
      source: "water-k12",
      country_code: "GLOBAL",
      name: "Water K-12",
        description: "The complete built-in K-12 curriculum — every grade, subject and lesson.",
        institution_name: "Water",
        subjects: files.map((f) => ({ subject: f.subject, grades: sortGradeLevels(f.lessons.map((l) => l.grade)), lesson_count: f.lessons.length })),
        grade_count: allGrades.length,
        course_count: files.length,
        lesson_count: files.reduce((n, f) => n + f.lessons.length, 0),
      });
    }
  }
  return c.json({ tracks: library });
});

// Deep-clone any Water track into the institution's own customizable copy:
// track → grades → courses → lessons, with fresh join codes.
institutionCurriculumRoutes.post("/tracks/import", async (c) => {
  const auth = await requireInstitutionUser(c);
  if (auth.error) return auth.error;
  const { source, track_id, subjects } = await c.req.json().catch(() => ({}));
  const now = new Date().toISOString();

  async function insertLesson(args: {
    trackId: string; gradeId: string; courseId: string;
    title: string; description: string; subject: string; gradeLevel: string;
    minutes: number; contentHtml: string; quizMarkdown: string;
  }): Promise<string> {
    const clsId = `cls-${crypto.randomBytes(5).toString("hex")}`;
    // Index row in DB (bodies stay '') — actual content goes to content/lessons/<id>/.
    await getDb().execute({
      sql: `INSERT INTO admin_classes (id, track_id, institution_id, title, description, subject, grade_level, estimated_minutes, content_html, game_path, game_filename, quiz_markdown, grade_id, course_id, is_published, class_code, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', '', '', '', ?, ?, 1, ?, ?, ?)`,
      args: [clsId, args.trackId, auth.user.id, args.title, args.description, args.subject, args.gradeLevel, args.minutes, args.gradeId, args.courseId, newCode("WC"), now, now],
    });
    writeLessonBody(
      clsId,
      { contentHtml: args.contentHtml, quizMarkdown: args.quizMarkdown },
      { title: args.title, subject: args.subject, grade_level: args.gradeLevel, estimated_minutes: args.minutes, track_id: args.trackId, grade_id: args.gradeId, course_id: args.courseId },
    );
    // No build step — the runtime LessonPlayer reads this JSON + the disk files.
    return clsId;
  }

  // ── Source: built-in Water K-12 → one track, grades, a course per subject in each grade ──
  if (source === "water-k12") {
    const wanted: string[] | null = Array.isArray(subjects) && subjects.length > 0 ? subjects.map((s: any) => String(s)) : null;
    const files = loadK12CurriculumFiles().filter((f) => !wanted || wanted.includes(f.subject));
    if (files.length === 0) return c.json({ error: "No matching Water K-12 subjects found" }, 404);
    const trackId = await createOwnTrack("Water K-12", "Full K-12 curriculum cloned from Water — every grade, course and lesson is yours to customize.", auth.user.id, now);
    const allGrades = sortGradeLevels(files.flatMap((f) => f.lessons.map((l) => l.grade)));
    const gradeIdByLevel = new Map<string, string>();
    let order = 0;
    for (const grade of allGrades) {
      const gid = `grade-${crypto.randomBytes(5).toString("hex")}`;
      await getDb().execute({
        sql: `INSERT INTO admin_track_grades (id, track_id, institution_id, grade_level, label, sort_order, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [gid, trackId, auth.user.id, grade, `Grade ${grade}`, order++, now],
      });
      gradeIdByLevel.set(grade, gid);
    }
    let courseOrder = 0;
    let lessonCount = 0;
    const importedCourses: string[] = [];
    for (const file of files) {
      const byGrade = new Map<string, typeof file.lessons>();
      for (const lesson of file.lessons) {
        const list = byGrade.get(String(lesson.grade)) || [];
        list.push(lesson);
        byGrade.set(String(lesson.grade), list);
      }
      for (const [grade, lessons] of byGrade.entries()) {
        const courseId = `course-${crypto.randomBytes(5).toString("hex")}`;
        await getDb().execute({
          sql: `INSERT INTO admin_courses (id, track_id, institution_id, grade_id, name, description, subject, sort_order, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [courseId, trackId, auth.user.id, gradeIdByLevel.get(grade) || "", file.subject, file.description || "", file.subject, courseOrder++, now],
        });
        importedCourses.push(`${file.subject} (Grade ${grade})`);
        for (const lesson of lessons) {
          await insertLesson({
            trackId, gradeId: gradeIdByLevel.get(grade) || "", courseId,
            title: lesson.title, description: lesson.storyHook || file.description || "",
            subject: lesson.subject, gradeLevel: String(lesson.grade),
            minutes: lesson.estimatedMinutes || 15,
            contentHtml: `<p>${lesson.storyHook || file.description || ""}</p>`, quizMarkdown: "",
          });
          lessonCount++;
        }
      }
    }
    return c.json({ track: { id: trackId, name: "Water K-12" }, grades: allGrades.length, courses: importedCourses.length, lessons: lessonCount }, 201);
  }

  // ── Source: a published system track → full deep copy ──
  if (source === "system") {
    if (!track_id) return c.json({ error: "track_id is required" }, 400);
    const srcTrack = await getDb().execute({ sql: "SELECT * FROM admin_tracks WHERE id = ? AND is_published = 1", args: [track_id] });
    if (srcTrack.rows.length === 0) return c.json({ error: "Water track not found" }, 404);
    const src = srcTrack.rows[0] as any;
    if (src.institution_id === auth.user.id) return c.json({ error: "Use your own track directly — no need to import it" }, 400);
    const trackId = await createOwnTrack(await uniqueTrackName(auth.user.id, src.name), src.description || "", auth.user.id, now, src.subject, src.country_code || "GLOBAL");
    // Grades → track level (matched by level for course/lesson placement).
    const srcGrades = await getDb().execute({ sql: "SELECT * FROM admin_track_grades WHERE track_id = ? ORDER BY sort_order ASC", args: [src.id] });
    const gradeIdByOld = new Map<string, string>();
    const gradeIdByLevel = new Map<string, string>();
    let order = 0;
    for (const g of srcGrades.rows as any[]) {
      const gid = `grade-${crypto.randomBytes(5).toString("hex")}`;
      await getDb().execute({
        sql: `INSERT INTO admin_track_grades (id, track_id, institution_id, grade_level, label, sort_order, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [gid, trackId, auth.user.id, g.grade_level, g.label, order++, now],
      });
      gradeIdByOld.set(g.id, gid);
      if (!gradeIdByLevel.has(String(g.grade_level))) gradeIdByLevel.set(String(g.grade_level), gid);
    }
    // Courses → attached to the matching grade (first of their grades, else unassigned).
    const srcCourses = await getDb().execute({ sql: "SELECT * FROM admin_courses WHERE track_id = ? ORDER BY sort_order ASC", args: [src.id] });
    const courseIdByOld = new Map<string, string>();
    const ensureGradeForLevel = async (level: string, labelFallback: string): Promise<string> => {
      const hit = gradeIdByLevel.get(String(level));
      if (hit) return hit;
      const gid = `grade-${crypto.randomBytes(5).toString("hex")}`;
      await getDb().execute({
        sql: `INSERT INTO admin_track_grades (id, track_id, institution_id, grade_level, label, sort_order, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [gid, trackId, auth.user.id, String(level), labelFallback || `Grade ${level}`, order++, now],
      });
      gradeIdByLevel.set(String(level), gid);
      return gid;
    };
    let courseOrder = 0;
    for (const co of srcCourses.rows as any[]) {
      let targetGradeId = co.grade_id && gradeIdByOld.get(co.grade_id) ? gradeIdByOld.get(co.grade_id)! : "";
      if (!targetGradeId) {
        // Legacy shape: the course's grades point back at it — use the first one's level.
        const backRef = await getDb().execute({ sql: "SELECT grade_level, label FROM admin_track_grades WHERE course_id = ? ORDER BY sort_order ASC LIMIT 1", args: [co.id] });
        if (backRef.rows.length > 0) {
          targetGradeId = await ensureGradeForLevel(String((backRef.rows[0] as any).grade_level), (backRef.rows[0] as any).label);
        }
      }
      const cid = `course-${crypto.randomBytes(5).toString("hex")}`;
      await getDb().execute({
        sql: `INSERT INTO admin_courses (id, track_id, institution_id, grade_id, name, description, subject, sort_order, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [cid, trackId, auth.user.id, targetGradeId, co.name, co.description || "", co.subject || "General", courseOrder++, now],
      });
      courseIdByOld.set(co.id, cid);
    }
    // Lessons → keep grade + course placement.
    const srcLessons = await getDb().execute({ sql: "SELECT * FROM admin_classes WHERE track_id = ? AND is_published = 1", args: [src.id] });
    let lessonCount = 0;
    for (const l of srcLessons.rows as any[]) {
      let gid = (l.grade_id && gradeIdByOld.get(l.grade_id)) || "";
      if (!gid && l.grade_level && l.grade_level !== "all") gid = await ensureGradeForLevel(String(l.grade_level), "");
      const cid = (l.course_id && courseIdByOld.get(l.course_id)) || "";
      const srcBody = readLessonBody(l.id);
      await insertLesson({
        trackId, gradeId: gid, courseId: cid,
        title: l.title, description: l.description || "", subject: l.subject || "General",
        gradeLevel: l.grade_level || "all", minutes: l.estimated_minutes || 15,
        contentHtml: srcBody.exists ? srcBody.contentHtml : (l.content_html || ""),
        quizMarkdown: srcBody.exists ? srcBody.quizMarkdown : (l.quiz_markdown || ""),
      });
      lessonCount++;
    }
    return c.json({ track: { id: trackId, name: (await getDb().execute({ sql: "SELECT name FROM admin_tracks WHERE id = ?", args: [trackId] })).rows[0] }, grades: gradeIdByLevel.size, courses: courseIdByOld.size, lessons: lessonCount }, 201);
  }

  return c.json({ error: "Unknown source — use 'water-k12' or 'system'" }, 400);

  async function createOwnTrack(name: string, description: string, institutionId: string, at: string, subject = "General", countryCode = "GLOBAL"): Promise<string> {
    const id = `track-inst-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    await getDb().execute({
      sql: `INSERT INTO admin_tracks (id, institution_id, name, description, grade_level, subject, country_code, is_published, created_at)
            VALUES (?, ?, ?, ?, 'all', ?, ?, 1, ?)`,
      args: [id, institutionId, name, description, subject, countryCode, at],
    });
    return id;
  }

  async function uniqueTrackName(institutionId: string, base: string): Promise<string> {
    const existing = await getDb().execute({ sql: "SELECT name FROM admin_tracks WHERE institution_id = ?", args: [institutionId] });
    const names = new Set((existing.rows as any[]).map((r) => r.name));
    if (!names.has(base)) return base;
    let i = 2;
    while (names.has(`${base} (copy ${i})`)) i++;
    return `${base} (copy ${i})`;
  }
});

// ─── Own classes ───

institutionCurriculumRoutes.get("/classes", async (c) => {
  const auth = await requireInstitutionUser(c);
  if (auth.error) return auth.error;
  const trackId = c.req.query("track_id");
  const sql = trackId
    ? "SELECT * FROM admin_classes WHERE institution_id = ? AND track_id = ? ORDER BY created_at ASC"
    : "SELECT * FROM admin_classes WHERE institution_id = ? ORDER BY created_at ASC";
  const args: any[] = trackId ? [auth.user.id, trackId] : [auth.user.id];
  const res = await getDb().execute({ sql, args });
  return c.json({ classes: res.rows });
});

institutionCurriculumRoutes.post("/classes", async (c) => {
  const auth = await requireInstitutionUser(c);
  if (auth.error) return auth.error;
  const { track_id, title, description, subject, grade_level, estimated_minutes, content_html, game_filename, quiz_markdown, grade_id, course_id } = await c.req.json();
  if (!track_id || !title?.trim()) return c.json({ error: "track_id and title are required" }, 400);
  const track = await getDb().execute({ sql: "SELECT id FROM admin_tracks WHERE id = ? AND institution_id = ?", args: [track_id, auth.user.id] });
  if (track.rows.length === 0) return c.json({ error: "Track not found" }, 404);
  // Resolve grade: a course dictates its grade; otherwise the grade stands alone.
  let resolvedGradeId = "";
  let resolvedCourseId = "";
  if (course_id) {
    const course = await getDb().execute({ sql: "SELECT id, grade_id FROM admin_courses WHERE id = ? AND track_id = ?", args: [course_id, track_id] });
    if (course.rows.length === 0) return c.json({ error: "Course not found in this track" }, 404);
    resolvedCourseId = course_id;
    resolvedGradeId = (course.rows[0] as any).grade_id || "";
  } else if (grade_id) {
    const grade = await getDb().execute({ sql: "SELECT id FROM admin_track_grades WHERE id = ? AND track_id = ?", args: [grade_id, track_id] });
    if (grade.rows.length === 0) return c.json({ error: "Grade not found in this track" }, 404);
    resolvedGradeId = grade_id;
  }
  const id = `cls-${crypto.randomBytes(5).toString("hex")}`;
  const classCode = newCode("WC");
  const now = new Date().toISOString();
  const gamePath = game_filename ? `/games/${game_filename}` : "";
  const finalTitle = title.trim();
  const finalSubject = subject || "General";
  const finalGradeLevel = grade_level || "all";
  // Index row in DB (bodies stay '') — actual content goes to content/lessons/<id>/.
  await getDb().execute({
    sql: `INSERT INTO admin_classes (id, track_id, institution_id, title, description, subject, grade_level, estimated_minutes, content_html, game_path, game_filename, quiz_markdown, grade_id, course_id, is_published, class_code, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, '', ?, ?, 1, ?, ?, ?)`,
    args: [id, track_id, auth.user.id, finalTitle, description || "", finalSubject, finalGradeLevel, estimated_minutes || 15, gamePath, game_filename || "", resolvedGradeId, resolvedCourseId, classCode, now, now],
  });
  writeLessonBody(
    id,
    { contentHtml: content_html || "", quizMarkdown: quiz_markdown || "" },
    { title: finalTitle, subject: finalSubject, grade_level: finalGradeLevel, estimated_minutes: estimated_minutes || 15, track_id, grade_id: resolvedGradeId, course_id: resolvedCourseId },
  );
  const cls = (await getDb().execute({ sql: "SELECT * FROM admin_classes WHERE id = ?", args: [id] })).rows[0];
  return c.json(withLessonBody(cls), 201);
});

// Single lesson WITH bodies (for the Studio editor) — lists carry index data only.
institutionCurriculumRoutes.get("/classes/:id", async (c) => {
  const auth = await requireInstitutionUser(c);
  if (auth.error) return auth.error;
  const res = await getDb().execute({
    sql: "SELECT * FROM admin_classes WHERE id = ? AND institution_id = ?",
    args: [c.req.param("id"), auth.user.id],
  });
  if (res.rows.length === 0) return c.json({ error: "Class not found" }, 404);
  return c.json(withLessonBody(res.rows[0]));
});

// ─── Runtime lesson viewing (JSON — no build step) ───
// Any logged-in user can view a PUBLISHED lesson (same visibility the old
// generated bundle had); owners can always preview their own drafts.
institutionCurriculumRoutes.get("/lessons/:id/view", async (c) => {
  const token = getSessionToken(c);
  const session = await validateSession(token);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  const res = await getDb().execute({ sql: "SELECT * FROM admin_classes WHERE id = ?", args: [c.req.param("id")] });
  if (res.rows.length === 0) return c.json({ error: "Lesson not found" }, 404);
  const row = res.rows[0] as any;
  const isOwner = row.institution_id === session.userId;
  if (!row.is_published && !isOwner) return c.json({ error: "Lesson not found" }, 404);
  const full = withLessonBody(row);
  return c.json({
    id: full.id, track_id: full.track_id, title: full.title, description: full.description,
    subject: full.subject, grade_level: full.grade_level, estimated_minutes: full.estimated_minutes,
    game_path: full.game_path, content_html: full.content_html || "", quiz_markdown: full.quiz_markdown || "",
  });
});

institutionCurriculumRoutes.put("/classes/:id", async (c) => {
  const auth = await requireInstitutionUser(c);
  if (auth.error) return auth.error;
  const id = c.req.param("id");
  const { title, description, subject, grade_level, estimated_minutes, content_html, game_filename, quiz_markdown, grade_id, course_id } = await c.req.json();
  const existing = await getDb().execute({ sql: "SELECT * FROM admin_classes WHERE id = ? AND institution_id = ?", args: [id, auth.user.id] });
  if (existing.rows.length === 0) return c.json({ error: "Class not found" }, 404);
  const existingRow = existing.rows[0] as any;
  let nextGradeId = existingRow.grade_id || "";
  let nextCourseId = existingRow.course_id || "";
  if (course_id !== undefined) {
    if (course_id) {
      const course = await getDb().execute({ sql: "SELECT id, grade_id FROM admin_courses WHERE id = ? AND track_id = ?", args: [course_id, existingRow.track_id] });
      if (course.rows.length === 0) return c.json({ error: "Course not found in this track" }, 404);
      nextCourseId = course_id;
      nextGradeId = (course.rows[0] as any).grade_id || "";
    } else {
      nextCourseId = "";
    }
  }
  if (grade_id !== undefined && !course_id) {
    if (grade_id) {
      const grade = await getDb().execute({ sql: "SELECT id FROM admin_track_grades WHERE id = ? AND track_id = ?", args: [grade_id, existingRow.track_id] });
      if (grade.rows.length === 0) return c.json({ error: "Grade not found in this track" }, 404);
      nextGradeId = grade_id;
    } else {
      nextGradeId = "";
    }
    if (!nextCourseId) {
      // grade change clears a stale course link only if it points elsewhere
    } else {
      const course = await getDb().execute({ sql: "SELECT grade_id FROM admin_courses WHERE id = ?", args: [nextCourseId] });
      if (course.rows.length === 0 || (course.rows[0] as any).grade_id !== nextGradeId) nextCourseId = "";
    }
  }
  const now = new Date().toISOString();
  const gamePath = game_filename ? `/games/${game_filename}` : "";
  const finalTitle = title?.trim() || existingRow.title;
  // Index data in DB; bodies only touch disk when the editor actually sent them.
  await getDb().execute({
    sql: `UPDATE admin_classes SET title = ?, description = ?, subject = ?, grade_level = ?, estimated_minutes = ?, game_path = ?, game_filename = ?, grade_id = ?, course_id = ?, updated_at = ? WHERE id = ?`,
    args: [finalTitle, description ?? "", subject ?? "General", grade_level ?? "all", estimated_minutes ?? 15, gamePath, game_filename || "", nextGradeId, nextCourseId, now, id],
  });
  const bodyPatch: { contentHtml?: string; quizMarkdown?: string } = {};
  if (content_html !== undefined) bodyPatch.contentHtml = content_html;
  if (quiz_markdown !== undefined) bodyPatch.quizMarkdown = quiz_markdown;
  if (Object.keys(bodyPatch).length > 0) {
    writeLessonBody(id, bodyPatch, { title: finalTitle, track_id: existingRow.track_id, grade_id: nextGradeId, course_id: nextCourseId });
  }
  const cls = (await getDb().execute({ sql: "SELECT * FROM admin_classes WHERE id = ?", args: [id] })).rows[0];
  return c.json(withLessonBody(cls));
});

institutionCurriculumRoutes.delete("/classes/:id", async (c) => {
  const auth = await requireInstitutionUser(c);
  if (auth.error) return auth.error;
  const id = c.req.param("id");
  const own = await getDb().execute({ sql: "SELECT id FROM admin_classes WHERE id = ? AND institution_id = ?", args: [id, auth.user.id] });
  if (own.rows.length === 0) return c.json({ error: "Class not found" }, 404);
  await getDb().execute({ sql: "DELETE FROM class_enrollments WHERE class_id = ?", args: [id] });
  await getDb().execute({ sql: "DELETE FROM admin_classes WHERE id = ?", args: [id] });
  deleteLessonDir(id);
  return c.json({ success: true });
});

// ─── Class join code & enrolled students ───

institutionCurriculumRoutes.get("/classes/:id/code", async (c) => {
  const auth = await requireInstitutionUser(c);
  if (auth.error) return auth.error;
  const res = await getDb().execute({
    sql: "SELECT id, class_code FROM admin_classes WHERE id = ? AND institution_id = ?",
    args: [c.req.param("id"), auth.user.id],
  });
  if (res.rows.length === 0) return c.json({ error: "Class not found" }, 404);
  const row = res.rows[0] as any;
  if (!row.class_code) {
    const code = newCode("WC");
    await getDb().execute({ sql: "UPDATE admin_classes SET class_code = ? WHERE id = ?", args: [code, row.id] });
    return c.json({ class_code: code });
  }
  return c.json({ class_code: row.class_code });
});

institutionCurriculumRoutes.post("/classes/:id/code/regenerate", async (c) => {
  const auth = await requireInstitutionUser(c);
  if (auth.error) return auth.error;
  const id = c.req.param("id");
  const own = await getDb().execute({ sql: "SELECT id FROM admin_classes WHERE id = ? AND institution_id = ?", args: [id, auth.user.id] });
  if (own.rows.length === 0) return c.json({ error: "Class not found" }, 404);
  const code = newCode("WC");
  await getDb().execute({ sql: "UPDATE admin_classes SET class_code = ? WHERE id = ?", args: [code, id] });
  return c.json({ class_code: code });
});

institutionCurriculumRoutes.get("/classes/:id/students", async (c) => {
  const auth = await requireInstitutionUser(c);
  if (auth.error) return auth.error;
  const classId = c.req.param("id");
  const own = await getDb().execute({ sql: "SELECT id FROM admin_classes WHERE id = ? AND institution_id = ?", args: [classId, auth.user.id] });
  if (own.rows.length === 0) return c.json({ error: "Class not found" }, 404);
  const hasQuiz = !!readLessonBody(classId).quizMarkdown.trim();
  const res = await getDb().execute({
    sql: `SELECT u.id, u.name, u.email, u.gradeLevel AS grade_level, u.enrollmentType AS enrollment_type,
                 sp.points, sp.streakDays, sp.level, sp.lastActiveDate AS last_active,
                 cp.score AS class_score, cp.total AS class_total, cp.status AS class_status, cp.completed_at AS class_completed_at
          FROM class_enrollments e JOIN turso_records u ON u.id = e.student_id
          LEFT JOIN student_progress sp ON sp.id = u.id
          LEFT JOIN class_progress cp ON cp.student_id = e.student_id AND cp.class_id = ?
          WHERE e.class_id = ? ORDER BY e.enrolled_at ASC`,
    args: [classId, classId],
  });
  return c.json({ has_quiz: hasQuiz, students: res.rows });
});

institutionCurriculumRoutes.delete("/classes/:id/students/:studentId", async (c) => {
  const auth = await requireInstitutionUser(c);
  if (auth.error) return auth.error;
  const classId = c.req.param("id");
  const own = await getDb().execute({ sql: "SELECT id FROM admin_classes WHERE id = ? AND institution_id = ?", args: [classId, auth.user.id] });
  if (own.rows.length === 0) return c.json({ error: "Class not found" }, 404);
  await getDb().execute({ sql: "DELETE FROM class_enrollments WHERE class_id = ? AND student_id = ?", args: [classId, c.req.param("studentId")] });
  return c.json({ success: true });
});

// ─── Tutor ↔ class assignment (human tutors linked to their classes) ───

// List tutors (from the tutors table) enriched with assigned class + grade permissions
institutionCurriculumRoutes.get("/tutors", async (c) => {
  const auth = await requireInstitutionUser(c);
  if (auth.error) return auth.error;
  const tutorsRes = await getDb().execute({
    sql: "SELECT id, name, email, subjects, grade_levels FROM tutors WHERE institution_id = ? ORDER BY created_at ASC",
    args: [auth.user.id],
  });
  const assignRes = await getDb().execute({
    sql: `SELECT a.tutor_id, a.class_id, ac.title AS class_title FROM tutor_class_assignments a
          JOIN admin_classes ac ON ac.id = a.class_id WHERE ac.institution_id = ?`,
    args: [auth.user.id],
  });
  const byTutor = new Map<string, Array<{ class_id: string; class_title: string }>>();
  for (const row of assignRes.rows as any[]) {
    const list = byTutor.get(row.tutor_id) || [];
    list.push({ class_id: row.class_id, class_title: row.class_title });
    byTutor.set(row.tutor_id, list);
  }
  const gradeRes = await getDb().execute({
    sql: `SELECT ga.tutor_id, ga.grade_id, g.label AS grade_label, g.grade_level, t.name AS track_name
          FROM tutor_grade_assignments ga
          JOIN admin_track_grades g ON g.id = ga.grade_id
          JOIN admin_tracks t ON t.id = g.track_id
          WHERE t.institution_id = ?`,
    args: [auth.user.id],
  });
  const gradesByTutor = new Map<string, Array<{ grade_id: string; grade_label: string; grade_level: string; track_name: string }>>();
  for (const row of gradeRes.rows as any[]) {
    const list = gradesByTutor.get(row.tutor_id) || [];
    list.push({ grade_id: row.grade_id, grade_label: row.grade_label, grade_level: row.grade_level, track_name: row.track_name });
    gradesByTutor.set(row.tutor_id, list);
  }
  const tutors = (tutorsRes.rows as any[]).map((t) => ({
    ...t,
    subjects: safeParseJsonArray(t.subjects),
    grade_levels: safeParseJsonArray(t.grade_levels),
    classes: byTutor.get(t.id) || [],
    grades: gradesByTutor.get(t.id) || [],
  }));
  return c.json({ tutors });
});

// All grades across the institution's tracks (grade-assignment picker)
institutionCurriculumRoutes.get("/grades", async (c) => {
  const auth = await requireInstitutionUser(c);
  if (auth.error) return auth.error;
  const res = await getDb().execute({
    sql: `SELECT g.id, g.track_id, g.grade_level, g.label, t.name AS track_name,
            (SELECT COUNT(*) FROM admin_classes cl WHERE cl.grade_id = g.id) AS lesson_count
          FROM admin_track_grades g JOIN admin_tracks t ON t.id = g.track_id
          WHERE t.institution_id = ? ORDER BY t.created_at DESC, g.sort_order ASC`,
    args: [auth.user.id],
  });
  return c.json({ grades: res.rows });
});

// Assign a tutor to a grade (both must belong to this institution).
// Grade permission: the tutor sees every class in the grade (with students).
institutionCurriculumRoutes.post("/tutors/assign-grade", async (c) => {
  const auth = await requireInstitutionUser(c);
  if (auth.error) return auth.error;
  const { tutor_id, grade_id } = await c.req.json();
  if (!tutor_id || !grade_id) return c.json({ error: "tutor_id and grade_id required" }, 400);
  const tutor = await getDb().execute({ sql: "SELECT id FROM tutors WHERE id = ? AND institution_id = ?", args: [tutor_id, auth.user.id] });
  if (tutor.rows.length === 0) return c.json({ error: "Tutor not found" }, 404);
  const grade = await getDb().execute({
    sql: `SELECT g.id FROM admin_track_grades g JOIN admin_tracks t ON t.id = g.track_id
          WHERE g.id = ? AND t.institution_id = ?`,
    args: [grade_id, auth.user.id],
  });
  if (grade.rows.length === 0) return c.json({ error: "Grade not found" }, 404);
  await getDb().execute({
    sql: "INSERT OR IGNORE INTO tutor_grade_assignments (id, tutor_id, grade_id, assigned_at) VALUES (?, ?, ?, ?)",
    args: [`tga-${tutor_id}-${grade_id}`, tutor_id, grade_id, new Date().toISOString()],
  });
  return c.json({ success: true });
});

// Unassign a tutor from a grade
institutionCurriculumRoutes.delete("/tutors/:tutorId/grades/:gradeId", async (c) => {
  const auth = await requireInstitutionUser(c);
  if (auth.error) return auth.error;
  const { tutorId, gradeId } = c.req.param();
  await getDb().execute({ sql: "DELETE FROM tutor_grade_assignments WHERE tutor_id = ? AND grade_id = ?", args: [tutorId, gradeId] });
  return c.json({ success: true });
});

// Assign a tutor to a class (both must belong to this institution)
institutionCurriculumRoutes.post("/tutors/assign-class", async (c) => {
  const auth = await requireInstitutionUser(c);
  if (auth.error) return auth.error;
  const { tutor_id, class_id } = await c.req.json();
  if (!tutor_id || !class_id) return c.json({ error: "tutor_id and class_id required" }, 400);
  const tutor = await getDb().execute({ sql: "SELECT id FROM tutors WHERE id = ? AND institution_id = ?", args: [tutor_id, auth.user.id] });
  if (tutor.rows.length === 0) return c.json({ error: "Tutor not found" }, 404);
  const cls = await getDb().execute({ sql: "SELECT id FROM admin_classes WHERE id = ? AND institution_id = ?", args: [class_id, auth.user.id] });
  if (cls.rows.length === 0) return c.json({ error: "Class not found" }, 404);
  await getDb().execute({
    sql: "INSERT OR IGNORE INTO tutor_class_assignments (id, tutor_id, class_id, assigned_at) VALUES (?, ?, ?, ?)",
    args: [`tca-${tutor_id}-${class_id}`, tutor_id, class_id, new Date().toISOString()],
  });
  return c.json({ success: true });
});

// Unassign a tutor from a class
institutionCurriculumRoutes.delete("/tutors/:tutorId/classes/:classId", async (c) => {
  const auth = await requireInstitutionUser(c);
  if (auth.error) return auth.error;
  const { tutorId, classId } = c.req.param();
  await getDb().execute({ sql: "DELETE FROM tutor_class_assignments WHERE tutor_id = ? AND class_id = ?", args: [tutorId, classId] });
  return c.json({ success: true });
});

// ═══════════════════════════════════════════════════════════════
// Student-side endpoints (any logged-in user)
// ═══════════════════════════════════════════════════════════════

// Student joins a class by its code
institutionCurriculumRoutes.post("/join-class", async (c) => {
  const token = getSessionToken(c);
  const session = await validateSession(token);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  const { code } = await c.req.json();
  const clean = String(code || "").trim().toUpperCase();
  if (!clean) return c.json({ error: "code required" }, 400);
  const cls = await getDb().execute({ sql: "SELECT id, title FROM admin_classes WHERE class_code = ? AND is_published = 1", args: [clean] });
  if (cls.rows.length === 0) return c.json({ error: "Invalid or unknown class code" }, 404);
  await getDb().execute({
    sql: "INSERT OR IGNORE INTO class_enrollments (id, class_id, student_id, enrolled_at) VALUES (?, ?, ?, ?)",
    args: [`enr-${crypto.randomBytes(6).toString("hex")}`, (cls.rows[0] as any).id, session.userId, new Date().toISOString()],
  });
  return c.json({ success: true, class_id: (cls.rows[0] as any).id, class_title: (cls.rows[0] as any).title });
});

// Student's joined classes
institutionCurriculumRoutes.get("/my-classes", async (c) => {
  const token = getSessionToken(c);
  const session = await validateSession(token);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  const res = await getDb().execute({
    sql: `SELECT ac.id, ac.title, ac.subject, ac.grade_level, u.name AS institution_name, e.enrolled_at
          FROM class_enrollments e JOIN admin_classes ac ON ac.id = e.class_id
          JOIN turso_records u ON u.id = ac.institution_id
          WHERE e.student_id = ? ORDER BY e.enrolled_at DESC`,
    args: [session.userId],
  });
  return c.json({ classes: res.rows });
});
