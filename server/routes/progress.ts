import { Hono } from "hono";
import { getDb } from "../db";
import { getSessionToken, validateSession } from "../session";

export const progressRoutes = new Hono();

progressRoutes.get("/", async (c) => {
  const token = getSessionToken(c);
  const session = await validateSession(token);
  const id = session?.userId || "default";
  try {
    const { rows } = await getDb().execute({
      sql: "SELECT * FROM student_progress WHERE id = ?",
      args: [id],
    });
    if (rows.length > 0) {
      const row = rows[0] as any;
      return c.json({ points: row.points, streakDays: row.streakDays, level: row.level, completedLessons: JSON.parse(row.completedLessons || '[]'), unlockedBadges: JSON.parse(row.unlockedBadges || '[]'), lastActiveDate: row.lastActiveDate });
    }
    return c.json({ points: 0, streakDays: 0, level: 1, completedLessons: [], unlockedBadges: [], lastActiveDate: new Date().toISOString().split("T")[0] });
  } catch {
    return c.json({ points: 0, streakDays: 0, level: 1, completedLessons: [], unlockedBadges: [], lastActiveDate: new Date().toISOString().split("T")[0] });
  }
});

progressRoutes.post("/", async (c) => {
  try {
    const token = getSessionToken(c);
    const session = await validateSession(token);
    const body = await c.req.json();
    const id = session?.userId || "default";
    await getDb().execute({
      sql: `INSERT INTO student_progress (id, points, streakDays, level, completedLessons, unlockedBadges, lastActiveDate) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET points=excluded.points, streakDays=excluded.streakDays, level=excluded.level, completedLessons=excluded.completedLessons, unlockedBadges=excluded.unlockedBadges, lastActiveDate=excluded.lastActiveDate`,
      args: [id, body.points || 0, body.streakDays || 0, body.level || 1, JSON.stringify(body.completedLessons || []), JSON.stringify(body.unlockedBadges || []), body.lastActiveDate || new Date().toISOString().split("T")[0]],
    });
    return c.json(body);
  } catch (err: any) {
    return c.json({ error: "Failed to save progress" }, 400);
  }
});

// Students report their studio-class quiz result; institutions read it back
// through the curriculum students endpoint. Uses UPSERT keyed by (class, student).
progressRoutes.post("/class-result", async (c) => {
  const token = getSessionToken(c);
  const session = await validateSession(token);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  try {
    const { class_id, score, total, completion } = await c.req.json();
    if (!class_id) return c.json({ error: "class_id required" }, 400);
    const s = Math.max(0, parseInt(score) || 0);
    const t = Math.max(0, parseInt(total) || 0);
    // Quiz mode: pass = ≥70%. completion mode (non-quiz classes): direct completion.
    const reportStatus = completion === true || (t > 0 && s >= Math.ceil(t * 0.7)) ? "completed" : "in_progress";
    await getDb().execute({
      sql: `INSERT INTO class_progress (id, class_id, student_id, score, total, status, completed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(class_id, student_id) DO UPDATE SET
              score = MAX(class_progress.score, excluded.score),
              total = excluded.total,
              -- never downgrade a completed class back to in_progress on a later retake
              status = CASE WHEN class_progress.status = 'completed' OR excluded.status = 'completed' THEN 'completed' ELSE excluded.status END,
              completed_at = COALESCE(class_progress.completed_at, excluded.completed_at)`,
      args: [`cpr-${class_id}-${session.userId}`, class_id, session.userId, s, t, reportStatus, new Date().toISOString()],
    });
    const row = (await getDb().execute({
      sql: "SELECT score, total, status, completed_at FROM class_progress WHERE class_id = ? AND student_id = ?",
      args: [class_id, session.userId],
    })).rows[0] as any;
    return c.json({ success: true, score: row.score, total: row.total, status: row.status });
  } catch (err: any) {
    return c.json({ error: "Failed to save class result", details: err.message }, 400);
  }
});
