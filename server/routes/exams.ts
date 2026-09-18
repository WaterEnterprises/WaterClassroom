import { Hono } from "hono";
import { getDb } from "../db";
import { getSessionToken, validateSession } from "../session";

export const examRoutes = new Hono();

examRoutes.post("/start", async (c) => {
  try {
    const token = getSessionToken(c);
    const session = await validateSession(token);
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    const { exam_id } = await c.req.json();
    if (!exam_id) return c.json({ error: "exam_id required" }, 400);
    const examRes = await getDb().execute({ sql: "SELECT * FROM exams WHERE id = ?", args: [exam_id] });
    if (examRes.rows.length === 0) return c.json({ error: "Exam not found" }, 404);
    const exam = examRes.rows[0] as any;
    const lessonRes = await getDb().execute({ sql: "SELECT * FROM lessons WHERE id = ?", args: [exam.lesson_id] });
    if (lessonRes.rows.length === 0) return c.json({ error: "Lesson not found" }, 404);
    const lesson = lessonRes.rows[0] as any;
    const quizData = lesson.quiz_ref ? JSON.parse(lesson.quiz_ref || '{"questions":[]}') : { questions: [] };
    const attemptId = `attempt-${Date.now()}`;
    await getDb().execute({
      sql: `INSERT INTO exam_attempts (id, student_id, exam_id, score, max_score, proctor_flags, camera_authorized, status, started_at) VALUES (?, ?, ?, NULL, 1.0, '[]', 0, 'in_progress', ?)`,
      args: [attemptId, session.userId, exam_id, new Date().toISOString()],
    });
    return c.json({ exam_id: exam.id, duration_seconds: exam.duration_seconds, questions: quizData.questions || [], attempt_id: attemptId });
  } catch (err: any) {
    return c.json({ error: "Failed to start exam", details: err.message }, 500);
  }
});

examRoutes.post("/:attemptId/submit", async (c) => {
  try {
    const token = getSessionToken(c);
    const session = await validateSession(token);
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    const attemptId = c.req.param("attemptId");
    const { answers } = await c.req.json();
    const attemptRes = await getDb().execute({ sql: "SELECT * FROM exam_attempts WHERE id = ? AND student_id = ?", args: [attemptId, session.userId] });
    if (attemptRes.rows.length === 0) return c.json({ error: "Attempt not found" }, 404);
    const attempt = attemptRes.rows[0] as any;
    const examRes = await getDb().execute({ sql: "SELECT * FROM exams WHERE id = ?", args: [attempt.exam_id] });
    const exam = examRes.rows[0] as any;
    const lessonRes = await getDb().execute({ sql: "SELECT quiz_ref FROM lessons WHERE id = ?", args: [exam.lesson_id] });
    const quizData = lessonRes.rows.length > 0 ? JSON.parse((lessonRes.rows[0] as any).quiz_ref || '{"questions":[]}') : { questions: [] };
    const questions = quizData.questions || [];
    let correct = 0;
    questions.forEach((q: any, idx: number) => {
      if (answers[idx] === q.correctAnswerIndex) correct++;
    });
    const score = questions.length > 0 ? correct / questions.length : 0;
    const passed = score >= (exam.passing_score || 0.7);
    const status = passed ? "verified" : "flagged";
    await getDb().execute({
      sql: `UPDATE exam_attempts SET score = ?, status = ?, completed_at = ? WHERE id = ?`,
      args: [score, status, new Date().toISOString(), attemptId],
    });
    if (passed) {
      const progressRes = await getDb().execute({ sql: "SELECT * FROM student_progress WHERE id = 'default'" });
      let progress: any = { points: 0, completedLessons: [], unlockedBadges: [] };
      if (progressRes.rows.length > 0) {
        progress = progressRes.rows[0] as any;
      }
      const completedLessons = JSON.parse(progress.completedLessons || '[]');
      if (!completedLessons.includes(exam.lesson_id)) completedLessons.push(exam.lesson_id);
      const newPoints = (progress.points || 0) + 100;
      const unlockedBadges = JSON.parse(progress.unlockedBadges || '[]');
      if (!unlockedBadges.includes("exam-master")) unlockedBadges.push("exam-master");
      await getDb().execute({
        sql: `INSERT INTO student_progress (id, points, streakDays, level, completedLessons, unlockedBadges, lastActiveDate) VALUES ('default', ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET points=excluded.points, completedLessons=excluded.completedLessons, unlockedBadges=excluded.unlockedBadges`,
        args: [newPoints, progress.streakDays || 0, Math.floor(newPoints / 1000) + 1, JSON.stringify(completedLessons), JSON.stringify(unlockedBadges), new Date().toISOString().split("T")[0]],
      });
    }
    return c.json({ attempt_id: attemptId, score, passed, verified: passed, proctor_flags: [], status });
  } catch (err: any) {
    return c.json({ error: "Failed to submit exam", details: err.message }, 500);
  }
});
