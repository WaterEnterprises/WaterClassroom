import { Hono } from "hono";
import { getDb, WATER_SYSTEM_OWNER } from "../db";
import { getSessionToken, validateSession } from "../session";
import { saveUploadedGame } from "../class-materializer";
import { writeLessonBody, withLessonBody, deleteLessonDir, readLessonBody } from "../lesson-files";
import { normalizeCountryCode } from "./institution-curriculum";
import crypto from "crypto";

// ═══════════════════════════════════════════════════════════════
// Class Studio (SYSTEM) — global curriculum: K-12 and world programs.
// Every route here requires an institution account WITH system permission.
// Institutions manage their own curriculum in institution-curriculum.ts.
// ═══════════════════════════════════════════════════════════════

// ─── Auth helpers ───
async function requireInstitution(c: any) {
  const token = getSessionToken(c);
  const session = await validateSession(token);
  if (!session) return { error: c.json({ error: "Unauthorized" }, 401) };
  const userRes = await getDb().execute({ sql: "SELECT * FROM turso_records WHERE id = ?", args: [session.userId] });
  if (userRes.rows.length === 0) return { error: c.json({ error: "User not found" }, 404) };
  const user = userRes.rows[0] as any;
  if (user.type !== "Institution") return { error: c.json({ error: "Forbidden — institution account required" }, 403) };
  return { user };
}

async function requireSystemStudio(c: any) {
  const auth = await requireInstitution(c);
  if (auth.error) return auth;
  if (!(auth.user as any).hasSystemPermission) {
    return { error: c.json({ error: "Forbidden — system permission required for the Class Studio" }, 403) };
  }
  return { user: auth.user };
}

export const adminStudioRoutes = new Hono();

// System users manage their own tracks plus canonical Water tracks.
function canManage(ownerId: string, userId: string): boolean {
  return ownerId === userId || ownerId === WATER_SYSTEM_OWNER;
}

// ═══ System tracks (global curriculum) ═══

adminStudioRoutes.get("/tracks", async (c) => {
  const auth = await requireSystemStudio(c);
  if (auth.error) return auth.error;
  const res = await getDb().execute({
    sql: "SELECT * FROM admin_tracks WHERE institution_id IN (?, ?) ORDER BY created_at DESC",
    args: [auth.user.id, WATER_SYSTEM_OWNER],
  });
  return c.json({ tracks: res.rows });
});

adminStudioRoutes.post("/tracks", async (c) => {
  const auth = await requireSystemStudio(c);
  if (auth.error) return auth.error;
  const { name, description, grade_level, subject, country_code } = await c.req.json();
  if (!name?.trim()) return c.json({ error: "Track name is required" }, 400);
  const id = `track-admin-${Date.now()}`;
  const now = new Date().toISOString();
  const country = normalizeCountryCode(country_code) || "GLOBAL";
  await getDb().execute({
    sql: `INSERT INTO admin_tracks (id, institution_id, name, description, grade_level, subject, country_code, is_published, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    args: [id, auth.user.id, name.trim(), description || "", grade_level || "all", subject || "General", country, now],
  });
  return c.json({ id, name: name.trim(), description, grade_level: grade_level || "all", subject: subject || "General", country_code: country }, 201);
});

adminStudioRoutes.put("/tracks/:id", async (c) => {
  const auth = await requireSystemStudio(c);
  if (auth.error) return auth.error;
  const id = c.req.param("id");
  const existing = await getDb().execute({ sql: "SELECT * FROM admin_tracks WHERE id = ?", args: [id] });
  if (existing.rows.length === 0 || !canManage((existing.rows[0] as any).institution_id, auth.user.id)) return c.json({ error: "Track not found" }, 404);
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

adminStudioRoutes.delete("/tracks/:id", async (c) => {
  const auth = await requireSystemStudio(c);
  if (auth.error) return auth.error;
  const id = c.req.param("id");
  const own = await getDb().execute({ sql: "SELECT id, institution_id FROM admin_tracks WHERE id = ?", args: [id] });
  if (own.rows.length === 0 || !canManage((own.rows[0] as any).institution_id, auth.user.id)) return c.json({ error: "Track not found" }, 404);
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

// ═══ Grades & courses (track → grade → course → lesson) ═══

async function manageableTrack(c: any, auth: any, trackId: string) {
  const track = await getDb().execute({ sql: "SELECT id, institution_id FROM admin_tracks WHERE id = ?", args: [trackId] });
  if (track.rows.length === 0 || !canManage((track.rows[0] as any).institution_id, auth.user.id)) return null;
  return track.rows[0] as any;
}

async function manageableGrade(c: any, auth: any, gradeId: string) {
  const g = await getDb().execute({ sql: "SELECT * FROM admin_track_grades WHERE id = ?", args: [gradeId] });
  if (g.rows.length === 0) return null;
  const track = await manageableTrack(c, auth, (g.rows[0] as any).track_id);
  if (!track) return null;
  return { grade: g.rows[0] as any, track };
}

async function manageableCourse(c: any, auth: any, courseId: string) {
  const co = await getDb().execute({ sql: "SELECT * FROM admin_courses WHERE id = ?", args: [courseId] });
  if (co.rows.length === 0) return null;
  const track = await manageableTrack(c, auth, (co.rows[0] as any).track_id);
  if (!track) return null;
  return { course: co.rows[0] as any, track };
}

adminStudioRoutes.get("/tracks/:id/grades", async (c) => {
  const auth = await requireSystemStudio(c);
  if (auth.error) return auth.error;
  const trackId = c.req.param("id");
  if (!(await manageableTrack(c, auth, trackId))) return c.json({ error: "Track not found" }, 404);
  const res = await getDb().execute({
    sql: `SELECT g.*, (SELECT COUNT(*) FROM admin_classes cl WHERE cl.grade_id = g.id) AS lesson_count
          FROM admin_track_grades g WHERE g.track_id = ? ORDER BY g.sort_order ASC, g.grade_level ASC`,
    args: [trackId],
  });
  return c.json({ grades: res.rows });
});

adminStudioRoutes.post("/tracks/:id/grades", async (c) => {
  const auth = await requireSystemStudio(c);
  if (auth.error) return auth.error;
  const trackId = c.req.param("id");
  const track = await manageableTrack(c, auth, trackId);
  if (!track) return c.json({ error: "Track not found" }, 404);
  const { grade_level, label } = await c.req.json();
  if (!String(grade_level || "").trim()) return c.json({ error: "grade_level is required" }, 400);
  const count = await getDb().execute({ sql: "SELECT COUNT(*) AS n FROM admin_track_grades WHERE track_id = ?", args: [trackId] });
  const id = `grade-${crypto.randomBytes(5).toString("hex")}`;
  const now = new Date().toISOString();
  await getDb().execute({
    sql: `INSERT INTO admin_track_grades (id, track_id, institution_id, grade_level, label, sort_order, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [id, trackId, track.institution_id, String(grade_level).trim(), label || `Grade ${String(grade_level).trim()}`, (count.rows[0] as any).n || 0, now],
  });
  return c.json({ id, track_id: trackId, grade_level: String(grade_level).trim(), label: label || `Grade ${String(grade_level).trim()}`, lesson_count: 0 }, 201);
});

adminStudioRoutes.put("/grades/:id", async (c) => {
  const auth = await requireSystemStudio(c);
  if (auth.error) return auth.error;
  const found = await manageableGrade(c, auth, c.req.param("id"));
  if (!found) return c.json({ error: "Grade not found" }, 404);
  const { label, grade_level } = await c.req.json();
  const nextLevel = String(grade_level || "").trim() || found.grade.grade_level;
  await getDb().execute({
    sql: `UPDATE admin_track_grades SET label = ?, grade_level = ? WHERE id = ?`,
    args: [String(label || "").trim() || found.grade.label, nextLevel, found.grade.id],
  });
  const updated = (await getDb().execute({ sql: "SELECT * FROM admin_track_grades WHERE id = ?", args: [found.grade.id] })).rows[0];
  return c.json(updated);
});

adminStudioRoutes.delete("/grades/:id", async (c) => {
  const auth = await requireSystemStudio(c);
  if (auth.error) return auth.error;
  const found = await manageableGrade(c, auth, c.req.param("id"));
  if (!found) return c.json({ error: "Grade not found" }, 404);
  await getDb().execute({ sql: "UPDATE admin_classes SET grade_id = '' WHERE grade_id = ?", args: [found.grade.id] });
  await getDb().execute({ sql: "UPDATE admin_courses SET grade_id = '' WHERE grade_id = ?", args: [found.grade.id] });
  await getDb().execute({ sql: "DELETE FROM admin_track_grades WHERE id = ?", args: [found.grade.id] });
  return c.json({ success: true });
});

adminStudioRoutes.get("/tracks/:id/courses", async (c) => {
  const auth = await requireSystemStudio(c);
  if (auth.error) return auth.error;
  const trackId = c.req.param("id");
  if (!(await manageableTrack(c, auth, trackId))) return c.json({ error: "Track not found" }, 404);
  const res = await getDb().execute({
    sql: `SELECT c.*,
            (SELECT COUNT(*) FROM admin_classes cl WHERE cl.course_id = c.id) AS lesson_count
          FROM admin_courses c WHERE c.track_id = ? ORDER BY c.sort_order ASC, c.created_at ASC`,
    args: [trackId],
  });
  return c.json({ courses: res.rows });
});

adminStudioRoutes.post("/tracks/:id/courses", async (c) => {
  const auth = await requireSystemStudio(c);
  if (auth.error) return auth.error;
  const trackId = c.req.param("id");
  const track = await manageableTrack(c, auth, trackId);
  if (!track) return c.json({ error: "Track not found" }, 404);
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
    args: [id, trackId, track.institution_id, grade_id, String(name).trim(), description || "", subject || "General", (count.rows[0] as any).n || 0, now],
  });
  return c.json({ id, track_id: trackId, grade_id, name: String(name).trim(), description: description || "", subject: subject || "General", lesson_count: 0 }, 201);
});

adminStudioRoutes.put("/courses/:id", async (c) => {
  const auth = await requireSystemStudio(c);
  if (auth.error) return auth.error;
  const found = await manageableCourse(c, auth, c.req.param("id"));
  if (!found) return c.json({ error: "Course not found" }, 404);
  const { name, description, subject, grade_id } = await c.req.json();
  let nextGradeId = found.course.grade_id || "";
  if (grade_id !== undefined) {
    if (grade_id) {
      const grade = await getDb().execute({ sql: "SELECT id FROM admin_track_grades WHERE id = ? AND track_id = ?", args: [grade_id, found.course.track_id] });
      if (grade.rows.length === 0) return c.json({ error: "Grade not found in this track" }, 404);
      nextGradeId = grade_id;
    } else {
      nextGradeId = "";
    }
  }
  await getDb().execute({
    sql: `UPDATE admin_courses SET name = ?, description = ?, subject = ?, grade_id = ? WHERE id = ?`,
    args: [String(name || "").trim() || found.course.name, description ?? found.course.description, subject ?? found.course.subject, nextGradeId, found.course.id],
  });
  if (nextGradeId !== (found.course.grade_id || "")) {
    await getDb().execute({ sql: "UPDATE admin_classes SET grade_id = ? WHERE course_id = ?", args: [nextGradeId, found.course.id] });
  }
  return c.json({ success: true });
});

adminStudioRoutes.delete("/courses/:id", async (c) => {
  const auth = await requireSystemStudio(c);
  if (auth.error) return auth.error;
  const found = await manageableCourse(c, auth, c.req.param("id"));
  if (!found) return c.json({ error: "Course not found" }, 404);
  await getDb().execute({ sql: "UPDATE admin_classes SET course_id = '' WHERE course_id = ?", args: [found.course.id] });
  await getDb().execute({ sql: "DELETE FROM admin_courses WHERE id = ?", args: [found.course.id] });
  return c.json({ success: true });
});

// ═══ System classes (global curriculum) ═══

adminStudioRoutes.get("/classes", async (c) => {
  const auth = await requireSystemStudio(c);
  if (auth.error) return auth.error;
  const trackId = c.req.query("track_id");
  if (trackId) {
    const track = await getDb().execute({ sql: "SELECT institution_id FROM admin_tracks WHERE id = ?", args: [trackId] });
    if (track.rows.length === 0 || !canManage((track.rows[0] as any).institution_id, auth.user.id)) return c.json({ error: "Track not found" }, 404);
  }
  const sql = trackId
    ? "SELECT * FROM admin_classes WHERE track_id = ? ORDER BY created_at ASC"
    : "SELECT * FROM admin_classes WHERE institution_id IN (?, ?) ORDER BY created_at ASC";
  const args: any[] = trackId ? [trackId] : [auth.user.id, WATER_SYSTEM_OWNER];
  const res = await getDb().execute({ sql, args });
  return c.json({ classes: res.rows });
});

adminStudioRoutes.get("/classes/:id", async (c) => {
  const auth = await requireSystemStudio(c);
  if (auth.error) return auth.error;
  const res = await getDb().execute({
    sql: "SELECT * FROM admin_classes WHERE id = ?",
    args: [c.req.param("id")],
  });
  if (res.rows.length === 0 || !canManage((res.rows[0] as any).institution_id, auth.user.id)) return c.json({ error: "Class not found" }, 404);
  return c.json(withLessonBody(res.rows[0]));
});

adminStudioRoutes.post("/classes", async (c) => {
  const auth = await requireSystemStudio(c);
  if (auth.error) return auth.error;
  const { track_id, title, description, subject, grade_level, estimated_minutes, content_html, game_filename, quiz_markdown, grade_id, course_id } = await c.req.json();
  if (!track_id || !title?.trim()) return c.json({ error: "track_id and title are required" }, 400);
  const track = await getDb().execute({ sql: "SELECT id, institution_id FROM admin_tracks WHERE id = ?", args: [track_id] });
  if (track.rows.length === 0 || !canManage((track.rows[0] as any).institution_id, auth.user.id)) return c.json({ error: "Track not found" }, 404);
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
  const now = new Date().toISOString();
  const gamePath = game_filename ? `/games/${game_filename}` : "";
  const finalTitle = title.trim();
  // Index row in DB (bodies stay '') — actual content goes to content/lessons/<id>/.
  await getDb().execute({
    sql: `INSERT INTO admin_classes (id, track_id, institution_id, title, description, subject, grade_level, estimated_minutes, content_html, game_path, game_filename, quiz_markdown, grade_id, course_id, is_published, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, '', ?, ?, 1, ?, ?)`,
    args: [id, track_id, (track.rows[0] as any).institution_id, finalTitle, description || "", subject || "General", grade_level || "all", estimated_minutes || 15, gamePath, game_filename || "", resolvedGradeId, resolvedCourseId, now, now],
  });
  writeLessonBody(
    id,
    { contentHtml: content_html || "", quizMarkdown: quiz_markdown || "" },
    { title: finalTitle, subject: subject || "General", grade_level: grade_level || "all", estimated_minutes: estimated_minutes || 15, track_id, grade_id: resolvedGradeId, course_id: resolvedCourseId },
  );
  const cls = (await getDb().execute({ sql: "SELECT * FROM admin_classes WHERE id = ?", args: [id] })).rows[0];
  return c.json(withLessonBody(cls), 201);
});

adminStudioRoutes.put("/classes/:id", async (c) => {
  const auth = await requireSystemStudio(c);
  if (auth.error) return auth.error;
  const id = c.req.param("id");
  const { title, description, subject, grade_level, estimated_minutes, content_html, game_filename, quiz_markdown, grade_id, course_id } = await c.req.json();
  const existing = await getDb().execute({ sql: "SELECT * FROM admin_classes WHERE id = ?", args: [id] });
  if (existing.rows.length === 0 || !canManage((existing.rows[0] as any).institution_id, auth.user.id)) return c.json({ error: "Class not found" }, 404);
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
    writeLessonBody(id, bodyPatch, { title: finalTitle, track_id: (existing.rows[0] as any).track_id });
  }
  const cls = (await getDb().execute({ sql: "SELECT * FROM admin_classes WHERE id = ?", args: [id] })).rows[0];
  return c.json(withLessonBody(cls));
});

adminStudioRoutes.delete("/classes/:id", async (c) => {
  const auth = await requireSystemStudio(c);
  if (auth.error) return auth.error;
  const id = c.req.param("id");
  const own = await getDb().execute({ sql: "SELECT id, institution_id FROM admin_classes WHERE id = ?", args: [id] });
  if (own.rows.length === 0 || !canManage((own.rows[0] as any).institution_id, auth.user.id)) return c.json({ error: "Class not found" }, 404);
  await getDb().execute({ sql: "DELETE FROM class_enrollments WHERE class_id = ?", args: [id] });
  await getDb().execute({ sql: "DELETE FROM admin_classes WHERE id = ?", args: [id] });
  deleteLessonDir(id);
  return c.json({ success: true });
});

// ═══ Game upload (shared: system users AND institutions) ═══

adminStudioRoutes.post("/upload-game", async (c) => {
  const auth = await requireInstitution(c);
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

// ═══ Public endpoints (onboarding + student academy) ═══

adminStudioRoutes.get("/available-tracks", async (c) => {
  const res = await getDb().execute({
    sql: `SELECT t.id, t.name, t.description, t.grade_level, t.subject, t.institution_id, u.name AS institution_name,
                 (SELECT COUNT(*) FROM admin_classes cl WHERE cl.track_id = t.id AND cl.is_published = 1) AS class_count
          FROM admin_tracks t LEFT JOIN turso_records u ON u.id = t.institution_id
          WHERE t.is_published = 1 ORDER BY t.created_at DESC`,
  });
  return c.json({ tracks: res.rows });
});

adminStudioRoutes.get("/available-classes", async (c) => {
  const trackId = c.req.query("track_id");
  const sql = trackId
    ? "SELECT id, track_id, title, description, subject, grade_level, estimated_minutes, game_path, created_at FROM admin_classes WHERE track_id = ? AND is_published = 1 ORDER BY created_at ASC"
    : "SELECT id, track_id, title, description, subject, grade_level, estimated_minutes, game_path, created_at FROM admin_classes WHERE is_published = 1 ORDER BY track_id, created_at ASC";
  const res = await getDb().execute({ sql, args: trackId ? [trackId] : [] });
  // Quiz badge for browsing — bodies live on disk, so check each lesson file.
  const classes = (res.rows as any[]).map((row) => {
    let hasQuiz = false;
    try { hasQuiz = !!readLessonBody(row.id).quizMarkdown.trim(); } catch { /* treat as no quiz */ }
    return { ...row, has_quiz: hasQuiz };
  });
  return c.json({ classes });
});

// Full browse tree (Academy): every published track with its grades,
// courses inside each grade, and lessons inside each course (plus lessons
// sitting directly in a grade and ungrouped lessons). One request.
adminStudioRoutes.get("/browse-tree", async (c) => {
  const tracksRes = await getDb().execute({
    sql: `SELECT t.id, t.name, t.description, t.grade_level, t.subject, t.institution_id, u.name AS institution_name,
                 (SELECT COUNT(*) FROM admin_classes cl WHERE cl.track_id = t.id AND cl.is_published = 1) AS class_count
          FROM admin_tracks t LEFT JOIN turso_records u ON u.id = t.institution_id
          WHERE t.is_published = 1 ORDER BY t.created_at DESC`,
  });
  const tracks = tracksRes.rows as any[];
  const trackIds = tracks.map((t) => t.id);
  let grades: any[] = [];
  let courses: any[] = [];
  let classes: any[] = [];
  if (trackIds.length > 0) {
    const ph = trackIds.map(() => "?").join(",");
    const [gRes, cRes, clRes] = await Promise.all([
      getDb().execute({ sql: `SELECT * FROM admin_track_grades WHERE track_id IN (${ph}) ORDER BY sort_order ASC`, args: trackIds }),
      getDb().execute({ sql: `SELECT * FROM admin_courses WHERE track_id IN (${ph}) ORDER BY sort_order ASC`, args: trackIds }),
      getDb().execute({ sql: `SELECT id, track_id, title, description, subject, grade_level, estimated_minutes, game_path, grade_id, course_id, created_at FROM admin_classes WHERE track_id IN (${ph}) AND is_published = 1 ORDER BY created_at ASC`, args: trackIds }),
    ]);
    grades = gRes.rows as any[];
    courses = cRes.rows as any[];
    classes = (clRes.rows as any[]).map((row) => {
      let hasQuiz = false;
      try { hasQuiz = !!readLessonBody(row.id).quizMarkdown.trim(); } catch { /* treat as no quiz */ }
      return { ...row, has_quiz: hasQuiz };
    });
  }
  const tree = tracks.map((t) => {
    const tGrades = grades.filter((g) => g.track_id === t.id);
    const tCourses = courses.filter((co) => co.track_id === t.id);
    const tClasses = classes.filter((cl) => cl.track_id === t.id);
    const courseById = new Map<string, any>();
    for (const co of tCourses) courseById.set(co.id, { ...co, lessons: [] });
    const gradeViews = tGrades.map((g) => ({
      id: g.id, grade_level: g.grade_level, label: g.label || `Grade ${g.grade_level}`,
      courses: [] as any[], directLessons: [] as any[],
    }));
    const gradeById = new Map<string, any>();
    for (const g of gradeViews) gradeById.set(g.id, g);
    const looseCourses: any[] = [];
    for (const co of courseById.values()) {
      const g = co.grade_id && gradeById.get(co.grade_id);
      if (g) g.courses.push(co);
      else looseCourses.push(co);
    }
    const ungroupedLessons: any[] = [];
    for (const cl of tClasses) {
      if (cl.course_id && courseById.has(cl.course_id)) {
        courseById.get(cl.course_id).lessons.push(cl);
      } else if (cl.grade_id && gradeById.has(cl.grade_id)) {
        gradeById.get(cl.grade_id).directLessons.push(cl);
      } else {
        ungroupedLessons.push(cl);
      }
    }
    const { class_count, ...trackFields } = t;
    return { ...trackFields, class_count, grades: gradeViews, looseCourses, ungroupedLessons };
  });
  return c.json({ tracks: tree });
});

// Student selects a system track during onboarding (persists to their account)
adminStudioRoutes.post("/select-track", async (c) => {
  const token = getSessionToken(c);
  const session = await validateSession(token);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  const { track_id } = await c.req.json();
  if (!track_id) return c.json({ error: "track_id required" }, 400);
  const trackRes = await getDb().execute({ sql: "SELECT id, name FROM admin_tracks WHERE id = ? AND is_published = 1", args: [track_id] });
  if (trackRes.rows.length === 0) return c.json({ error: "Track not found" }, 404);
  await getDb().execute({ sql: "UPDATE turso_records SET adminTrackId = ? WHERE id = ?", args: [track_id, session.userId] });
  return c.json({ success: true, track_id, track_name: (trackRes.rows[0] as any).name });
});

// Student's currently selected system track + its classes
adminStudioRoutes.get("/my-track", async (c) => {
  const token = getSessionToken(c);
  const session = await validateSession(token);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  const userRes = await getDb().execute({ sql: "SELECT adminTrackId FROM turso_records WHERE id = ?", args: [session.userId] });
  const adminTrackId = (userRes.rows[0] as any)?.adminTrackId || "";
  if (!adminTrackId) return c.json({ track: null, classes: [] });
  const trackRes = await getDb().execute({ sql: "SELECT * FROM admin_tracks WHERE id = ? AND is_published = 1", args: [adminTrackId] });
  if (trackRes.rows.length === 0) return c.json({ track: null, classes: [] });
  const classesRes = await getDb().execute({
    sql: "SELECT id, title, description, subject, grade_level, estimated_minutes, game_path, created_at FROM admin_classes WHERE track_id = ? AND is_published = 1 ORDER BY created_at ASC",
    args: [adminTrackId],
  });
  return c.json({ track: trackRes.rows[0], classes: classesRes.rows });
});
