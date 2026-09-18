import crypto from "crypto";
import { getDb, loadK12CurriculumFiles, WATER_SYSTEM_OWNER } from "./db";
import { sanitizeHtml } from "./class-materializer";
import { writeLessonBody } from "./lesson-files";
import { LESSONS, QUIZZES } from "../src/lib/lessonsData";

// ═══════════════════════════════════════════════════════════════
// Water system tracks — canonical platform content owned by the
// sentinel WATER_SYSTEM_OWNER (no login). Seeded idempotently at
// boot with INSERT ... DO NOTHING so admin edits in the global
// Studio are never overwritten. Institutions clone these via import.
// Hierarchy: track → grade → course → lesson.
// ═══════════════════════════════════════════════════════════════

function newCode(prefix: string): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += alphabet[crypto.randomInt(alphabet.length)];
  return `${prefix}-${code}`;
}

function sortGradeLevels(levels: Array<string | number>): string[] {
  return [...new Set(levels.map(String))].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
}

// Minimal markdown → HTML for seeded lesson bodies (rendered via {@html}).
function markdownToHtml(md: string): string {
  const esc = String(md || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const inline = (s: string) =>
    s
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|\W)\*([^*\n]+)\*/g, "$1<em>$2</em>")
      .replace(/`([^`\n]+)`/g, "<code>$1</code>");
  const out: string[] = [];
  let inList = false;
  for (const raw of esc.split(/\r?\n/)) {
    const line = raw.trim();
    if (/^#{1,3}\s+/.test(line)) {
      if (inList) { out.push("</ul>"); inList = false; }
      const level = line.startsWith("###") ? "h3" : "h2";
      out.push(`<${level}>${inline(line.replace(/^#{1,3}\s+/, ""))}</${level}>`);
    } else if (/^[-*]\s+/.test(line)) {
      if (!inList) { out.push("<ul>"); inList = true; }
      out.push(`<li>${inline(line.replace(/^[-*]\s+/, ""))}</li>`);
    } else if (line === "") {
      if (inList) { out.push("</ul>"); inList = false; }
    } else {
      if (inList) { out.push("</ul>"); inList = false; }
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  if (inList) out.push("</ul>");
  return sanitizeHtml(out.join("\n"));
}

// Structured quiz → the markdown format the Studio parser understands.
function quizToMarkdown(quiz: any): string {
  if (!quiz || !Array.isArray(quiz.questions)) return "";
  const lines: string[] = [`## ${quiz.title || "Quiz"}`, ""];
  quiz.questions.forEach((q: any, i: number) => {
    lines.push(`**${i + 1}.** ${q.question}`);
    (q.options || []).forEach((opt: string, oi: number) => {
      lines.push(oi === q.correctAnswerIndex ? `✅ * ${opt}` : `- ${opt}`);
    });
    if (q.explanation) lines.push(`> ${q.explanation}`);
    lines.push("");
  });
  return lines.join("\n");
}

const FOUNDATION_COURSES: Record<string, string> = {
  creed: "The Creed",
  scitech: "Science & Technology",
  business: "Enterprise & Economics",
  dynamics: "Human Dynamics",
};

async function insertLesson(row: {
  id: string; trackId: string; gradeId: string; courseId: string;
  title: string; description: string; subject: string; gradeLevel: string;
  minutes: number; contentHtml: string; quizMarkdown: string; now: string;
}): Promise<boolean> {
  // Index row in DB (bodies stay ''), actual content in content/lessons/<id>/.
  const res = await getDb().execute({
    sql: `INSERT INTO admin_classes (id, track_id, institution_id, title, description, subject, grade_level, estimated_minutes, content_html, game_path, game_filename, quiz_markdown, grade_id, course_id, is_published, class_code, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', '', '', '', ?, ?, 1, ?, ?, ?)
          ON CONFLICT(id) DO NOTHING`,
    args: [row.id, row.trackId, WATER_SYSTEM_OWNER, row.title, row.description, row.subject, row.gradeLevel, row.minutes, row.gradeId, row.courseId, newCode("WC"), row.now, row.now],
  });
  const inserted = (res.rowsAffected ?? 0) > 0;
  if (inserted) {
    writeLessonBody(
      row.id,
      { contentHtml: row.contentHtml, quizMarkdown: row.quizMarkdown },
      {
        title: row.title, subject: row.subject, grade_level: row.gradeLevel,
        estimated_minutes: row.minutes, track_id: row.trackId,
        grade_id: row.gradeId, course_id: row.courseId,
      },
    );
  }
  return inserted;
}

export async function seedWaterSystemTracks() {
  const db = getDb();
  const now = new Date().toISOString();

  // ── Track 1: Water K-12 (from the shipped curriculum files) ──
  const k12TrackId = "water-track-k12";
  await db.execute({
    sql: `INSERT INTO admin_tracks (id, institution_id, name, description, grade_level, subject, is_published, created_at)
          VALUES (?, ?, 'Water K-12', 'The complete built-in K-12 curriculum — every grade, subject and lesson. Institutions clone and customize it.', 'all', 'General', 1, ?)
          ON CONFLICT(id) DO NOTHING`,
    args: [k12TrackId, WATER_SYSTEM_OWNER, now],
  });
  const files = loadK12CurriculumFiles();
  const allGrades = sortGradeLevels(files.flatMap((f) => f.lessons.map((l) => l.grade)));
  const gradeIdByLevel = new Map<string, string>();
  let gradeOrder = 0;
  for (const grade of allGrades) {
    const gid = `water-grade-k12-${grade}`;
    await db.execute({
      sql: `INSERT INTO admin_track_grades (id, track_id, institution_id, grade_level, label, sort_order, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`,
      args: [gid, k12TrackId, WATER_SYSTEM_OWNER, grade, `Grade ${grade}`, gradeOrder++, now],
    });
    gradeIdByLevel.set(grade, gid);
  }
  const subjectKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  let courseOrder = 0;
  for (const file of files) {
    const byGrade = new Map<string, typeof file.lessons>();
    for (const lesson of file.lessons) {
      const list = byGrade.get(String(lesson.grade)) || [];
      list.push(lesson);
      byGrade.set(String(lesson.grade), list);
    }
    for (const [grade, lessons] of byGrade.entries()) {
      const courseId = `water-course-k12-${grade}-${subjectKey(file.subject)}`;
      await db.execute({
        sql: `INSERT INTO admin_courses (id, track_id, institution_id, grade_id, name, description, subject, sort_order, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`,
        args: [courseId, k12TrackId, WATER_SYSTEM_OWNER, gradeIdByLevel.get(grade) || "", file.subject, file.description || "", file.subject, courseOrder++, now],
      });
      for (const lesson of lessons) {
        const clsId = `water-cls-${lesson.hash}`;
        await insertLesson({
          id: clsId, trackId: k12TrackId, gradeId: gradeIdByLevel.get(grade) || "", courseId,
          title: lesson.title, description: lesson.storyHook || file.description || "",
          subject: lesson.subject, gradeLevel: String(lesson.grade),
          minutes: lesson.estimatedMinutes || 15,
          contentHtml: `<p>${lesson.storyHook || file.description || ""}</p>`, quizMarkdown: "", now,
        });
      }
    }
  }

  // ── Track 2: Water Foundations (the academy's core lessons + quizzes) ──
  const foundTrackId = "water-track-foundations";
  await db.execute({
    sql: `INSERT INTO admin_tracks (id, institution_id, name, description, grade_level, subject, is_published, created_at)
          VALUES (?, ?, 'Water Foundations', 'The academy’s core lessons — creed, science & technology, enterprise, and human dynamics, each with an interactive quiz.', 'all', 'General', 1, ?)
          ON CONFLICT(id) DO NOTHING`,
    args: [foundTrackId, WATER_SYSTEM_OWNER, now],
  });
  const foundGradeId = "water-grade-found-all";
  await db.execute({
    sql: `INSERT INTO admin_track_grades (id, track_id, institution_id, grade_level, label, sort_order, created_at)
          VALUES (?, ?, ?, 'all', 'All Levels', 0, ?) ON CONFLICT(id) DO NOTHING`,
    args: [foundGradeId, foundTrackId, WATER_SYSTEM_OWNER, now],
  });
  const quizByLesson = new Map((QUIZZES as any[]).map((q) => [q.lessonId, q]));
  let foundOrder = 0;
  const seenCourses = new Set<string>();
  for (const lesson of LESSONS as any[]) {
    const key = String(lesson.curriculum || "general");
    const courseName = FOUNDATION_COURSES[key] || key;
    const courseId = `water-course-found-${key}`;
    if (!seenCourses.has(courseId)) {
      seenCourses.add(courseId);
      await db.execute({
        sql: `INSERT INTO admin_courses (id, track_id, institution_id, grade_id, name, description, subject, sort_order, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`,
        args: [courseId, foundTrackId, WATER_SYSTEM_OWNER, foundGradeId, courseName, lesson.description || "", courseName, foundOrder++, now],
      });
    }
    const clsId = `water-cls-${lesson.id}`;
    await insertLesson({
      id: clsId, trackId: foundTrackId, gradeId: foundGradeId, courseId,
      title: lesson.title, description: lesson.description || "",
      subject: courseName, gradeLevel: "all", minutes: lesson.durationMin || 15,
      contentHtml: markdownToHtml(lesson.content || ""), quizMarkdown: quizToMarkdown(quizByLesson.get(lesson.id)), now,
    });
  }

  console.log("✅ Water system tracks seeded");
}
