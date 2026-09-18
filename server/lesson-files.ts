import fs from "fs";
import path from "path";
import { getDb } from "./db";
import { sanitizeHtml } from "./class-materializer";

// ═══════════════════════════════════════════════════════════════
// Lesson bodies live on DISK — one folder per lesson:
//   content/lessons/<classId>/lesson.json    (index card: title, placement…)
//   content/lessons/<classId>/content.html   (lesson body)
//   content/lessons/<classId>/quiz.md        (quiz markdown)
// The database keeps only the INDEX: ids, hierarchy (track/grade/course),
// titles, join codes, publish flags, enrollments. Bodies are never in the DB.
// NOTE: local disk is ephemeral on most free hosts (e.g. Render free tier).
// For production persistence, mount a persistent disk at ./content.
// ═══════════════════════════════════════════════════════════════

export const LESSONS_CONTENT_ROOT = path.join(process.cwd(), "content", "lessons");

export function lessonDir(classId: string): string {
  const safe = String(classId).replace(/[^a-zA-Z0-9-_]/g, "_");
  return path.join(LESSONS_CONTENT_ROOT, safe);
}

export type LessonBody = { contentHtml: string; quizMarkdown: string; exists: boolean };

export function readLessonBody(classId: string): LessonBody {
  try {
    const dir = lessonDir(classId);
    const contentPath = path.join(dir, "content.html");
    const quizPath = path.join(dir, "quiz.md");
    const exists = fs.existsSync(contentPath) || fs.existsSync(quizPath);
    return {
      contentHtml: fs.existsSync(contentPath) ? fs.readFileSync(contentPath, "utf8") : "",
      quizMarkdown: fs.existsSync(quizPath) ? fs.readFileSync(quizPath, "utf8") : "",
      exists,
    };
  } catch {
    return { contentHtml: "", quizMarkdown: "", exists: false };
  }
}

export function writeLessonBody(
  classId: string,
  body: { contentHtml?: string; quizMarkdown?: string },
  meta?: Record<string, unknown>,
): void {
  const dir = lessonDir(classId);
  fs.mkdirSync(dir, { recursive: true });
  if (body.contentHtml !== undefined) fs.writeFileSync(path.join(dir, "content.html"), sanitizeHtml(body.contentHtml));
  if (body.quizMarkdown !== undefined) fs.writeFileSync(path.join(dir, "quiz.md"), body.quizMarkdown);
  const metaPath = path.join(dir, "lesson.json");
  let prev: Record<string, unknown> = {};
  try {
    if (fs.existsSync(metaPath)) prev = JSON.parse(fs.readFileSync(metaPath, "utf8"));
  } catch { /* start fresh */ }
  fs.writeFileSync(
    metaPath,
    JSON.stringify({ id: classId, ...prev, ...(meta || {}), updated_at: new Date().toISOString() }, null, 2),
  );
}

export function deleteLessonDir(classId: string): void {
  try {
    fs.rmSync(lessonDir(classId), { recursive: true, force: true });
  } catch { /* already gone */ }
}

// Overlay disk bodies onto a DB row (for editors / materializer).
export function withLessonBody(row: any): any {
  if (!row) return row;
  const disk = readLessonBody(row.id);
  if (!disk.exists) return row;
  return { ...row, content_html: disk.contentHtml, quiz_markdown: disk.quizMarkdown };
}

// One-time export: move any bodies still stored in DB columns to disk,
// then clear the columns so the DB holds index data only.
export async function migrateBodiesToDisk(): Promise<void> {
  const db = getDb();
  const rows = await db.execute({
    sql: "SELECT id, content_html, quiz_markdown, title, subject, grade_level, estimated_minutes, track_id, grade_id, course_id FROM admin_classes",
  });
  let moved = 0;
  for (const r of rows.rows as any[]) {
    const hasBody = (r.content_html || "") !== "" || (r.quiz_markdown || "") !== "";
    if (!hasBody) continue;
    const dir = lessonDir(r.id);
    const missing = !fs.existsSync(path.join(dir, "content.html")) && !fs.existsSync(path.join(dir, "quiz.md"));
    if (missing) {
      writeLessonBody(
        r.id,
        { contentHtml: r.content_html || "", quizMarkdown: r.quiz_markdown || "" },
        {
          title: r.title, subject: r.subject, grade_level: r.grade_level,
          estimated_minutes: r.estimated_minutes, track_id: r.track_id,
          grade_id: r.grade_id, course_id: r.course_id,
        },
      );
      moved++;
    }
    await db.execute({ sql: "UPDATE admin_classes SET content_html = '', quiz_markdown = '' WHERE id = ?", args: [r.id] });
  }
  if (moved > 0) console.log(`📦 Migrated ${moved} lesson bodies to disk (content/lessons/)`);
}
