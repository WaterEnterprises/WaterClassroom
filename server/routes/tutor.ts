import { Hono } from "hono";
import { getDb } from "../db";
import { getSessionToken, validateSession } from "../session";
import { readLessonBody } from "../lesson-files";

export const tutorRoutes = new Hono();

// ─── Tutor workspace ───
// Any Tutor account sees the classes assigned to them (via the tutors table,
// matched by email) plus the enrolled students + quiz status per class.

async function requireTutor(c: any) {
  const token = getSessionToken(c);
  const session = await validateSession(token);
  if (!session) return { error: c.json({ error: "Unauthorized" }, 401) };
  const userRes = await getDb().execute({ sql: "SELECT * FROM turso_records WHERE id = ?", args: [session.userId] });
  if (userRes.rows.length === 0) return { error: c.json({ error: "User not found" }, 404) };
  const user = userRes.rows[0] as any;
  if (user.type !== "Tutor") return { error: c.json({ error: "Forbidden — tutor account required" }, 403) };
  return { user };
}

tutorRoutes.get("/classes", async (c) => {
  const auth = await requireTutor(c);
  if (auth.error) return auth.error;
  const email = String((auth.user as any).email || "").toLowerCase();
  try {
    // Tutor rows created at invite-claim time share the tutor's email.
    const tutorRows = await getDb().execute({
      sql: "SELECT id, institution_id, name FROM tutors WHERE lower(email) = ?",
      args: [email],
    });
    const tutorIds = (tutorRows.rows as any[]).map((r) => r.id);
    if (tutorIds.length === 0) return c.json({ classes: [] });
    const placeholders = tutorIds.map(() => "?").join(",");
    // Direct class assignments…
    const assignRes = await getDb().execute({
      sql: `SELECT DISTINCT a.class_id FROM tutor_class_assignments a WHERE a.tutor_id IN (${placeholders})`,
      args: tutorIds,
    });
    const directIds = new Set((assignRes.rows as any[]).map((r) => r.class_id as string));
    // …plus every class inside the tutor's permitted grades.
    const gradeRes = await getDb().execute({
      sql: `SELECT DISTINCT ga.grade_id FROM tutor_grade_assignments ga WHERE ga.tutor_id IN (${placeholders})`,
      args: tutorIds,
    });
    const gradeIds = (gradeRes.rows as any[]).map((r) => r.grade_id as string);
    let viaGradeIds: string[] = [];
    if (gradeIds.length > 0) {
      const gp = gradeIds.map(() => "?").join(",");
      const clsRes = await getDb().execute({
        sql: `SELECT id FROM admin_classes WHERE grade_id IN (${gp}) AND is_published = 1`,
        args: gradeIds,
      });
      viaGradeIds = (clsRes.rows as any[]).map((r) => r.id as string);
    }
    const classIds = [...new Set([...directIds, ...viaGradeIds])];
    if (classIds.length === 0) return c.json({ classes: [] });
    const cp = classIds.map(() => "?").join(",");
    const classesRes = await getDb().execute({
      sql: `SELECT ac.*, u.name AS institution_name FROM admin_classes ac
            JOIN turso_records u ON u.id = ac.institution_id
            WHERE ac.id IN (${cp}) AND ac.is_published = 1 ORDER BY ac.created_at ASC`,
      args: classIds,
    });
    const classes: any[] = [];
    for (const cls of classesRes.rows as any[]) {
      const body = readLessonBody(cls.id);
      const studentsRes = await getDb().execute({
        sql: `SELECT u.id, u.name, u.email, u.gradeLevel AS grade_level,
                     sp.points, sp.level, sp.lastActiveDate AS last_active,
                     cp.score AS class_score, cp.total AS class_total,
                     cp.status AS class_status, cp.completed_at AS class_completed_at
              FROM class_enrollments e JOIN turso_records u ON u.id = e.student_id
              LEFT JOIN student_progress sp ON sp.id = u.id
              LEFT JOIN class_progress cp ON cp.student_id = e.student_id AND cp.class_id = ?
              WHERE e.class_id = ? ORDER BY e.enrolled_at ASC`,
        args: [cls.id, cls.id],
      });
      classes.push({
        id: cls.id,
        title: cls.title,
        description: cls.description,
        subject: cls.subject,
        grade_level: cls.grade_level,
        estimated_minutes: cls.estimated_minutes,
        institution_name: cls.institution_name,
        has_quiz: !!body.quizMarkdown.trim(),
        via_grade: !directIds.has(cls.id),
        students: studentsRes.rows,
      });
    }
    return c.json({ classes });
  } catch (err: any) {
    return c.json({ error: "Failed to load assigned classes", details: err.message }, 500);
  }
});
