import { Hono } from "hono";
import { getDb } from "../db";
import { getSessionToken, validateSession } from "../session";

export const curriculumRoutes = new Hono();

curriculumRoutes.get("/track", async (c) => {
  const token = getSessionToken(c);
  const session = await validateSession(token);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  try {
    const userRes = await getDb().execute({ sql: "SELECT * FROM turso_records WHERE id = ?", args: [session.userId] });
    if (userRes.rows.length === 0) return c.json({ error: "User not found" }, 404);
    const user = userRes.rows[0] as any;
    // Studio track takes precedence: if the student enrolled in a system-created track
    // during onboarding, serve its classes as the curriculum.
    const adminTrackId = (user.adminTrackId || "") as string;
    if (adminTrackId) {
      const adminTrackRes = await getDb().execute({ sql: "SELECT * FROM admin_tracks WHERE id = ? AND is_published = 1", args: [adminTrackId] });
      if (adminTrackRes.rows.length > 0) {
        const adminTrack = adminTrackRes.rows[0] as any;
        const clsRes = await getDb().execute({ sql: "SELECT * FROM admin_classes WHERE track_id = ? AND is_published = 1 ORDER BY created_at ASC", args: [adminTrackId] });
        const adminLessons = clsRes.rows.map((cl: any) => ({
          id: cl.id,
          title: cl.title,
          lesson_type: cl.game_path ? "game" : "content",
          estimated_minutes: cl.estimated_minutes,
          subject: cl.subject,
          grade_level: cl.grade_level,
          content_ref: cl.id,
        }));
        return c.json({ track_id: adminTrack.id, display_name: adminTrack.name, grade_level: adminTrack.grade_level, country_code: user.country || "US", lessons: adminLessons });
      }
    }
    // Classes the student joined by code are appended to any track content.
    const joinedRes = await getDb().execute({
      sql: `SELECT ac.id, ac.title, ac.subject, ac.grade_level, ac.estimated_minutes, ac.game_path
            FROM class_enrollments e JOIN admin_classes ac ON ac.id = e.class_id
            WHERE e.student_id = ? AND ac.is_published = 1 ORDER BY e.enrolled_at ASC`,
      args: [session.userId],
    });
    const joinedLessons = joinedRes.rows.map((cl: any) => ({
      id: cl.id,
      title: cl.title,
      lesson_type: cl.game_path ? "game" : "content",
      estimated_minutes: cl.estimated_minutes,
      subject: cl.subject,
      grade_level: cl.grade_level,
      content_ref: cl.id,
    }));
    const country = (user.country || "US") as string;
    const gradeLevel = (user.gradeLevel || "5") as string;
    const enrollmentType = (user.enrollmentType || "independent") as string;
    const affiliatedCode = (user.affiliatedCode || "") as string;
    let trackId = "";
    let trackDisplayName = "";
    let lessonIds: string[] = [];
    if (affiliatedCode && enrollmentType === "school-student") {
      const instRes = await getDb().execute({ sql: "SELECT id FROM turso_records WHERE affiliatedCode = ? AND type = 'Institution' LIMIT 1", args: [affiliatedCode] });
      if (instRes.rows.length > 0) {
        const instId = (instRes.rows[0] as any).id;
        const overrideRes = await getDb().execute({ sql: "SELECT ordered_lesson_ids, grade_level, subject FROM institution_curriculum_overrides WHERE institution_id = ? AND grade_level = ? LIMIT 1", args: [instId, gradeLevel] });
        if (overrideRes.rows.length > 0) {
          lessonIds = JSON.parse((overrideRes.rows[0] as any).ordered_lesson_ids || '[]');
          trackId = `override-${instId}-${gradeLevel}`;
          trackDisplayName = `Institution Override — Grade ${gradeLevel}`;
        }
      }
    }
    if (!trackId) {
      const trackRes = await getDb().execute({ sql: "SELECT * FROM curriculum_tracks WHERE country_code = ? AND grade_level = ? AND (track_type = 'country_standard' OR is_default = 1) LIMIT 1", args: [country, gradeLevel] });
      if (trackRes.rows.length > 0) {
        const track = trackRes.rows[0] as any;
        trackId = track.id;
        trackDisplayName = track.display_name;
        lessonIds = JSON.parse(track.lesson_ids || '[]');
      } else {
        const fbRes = await getDb().execute({ sql: "SELECT * FROM curriculum_tracks WHERE is_default = 1 LIMIT 1" });
        if (fbRes.rows.length > 0) {
          const fb = fbRes.rows[0] as any;
          trackId = fb.id;
          trackDisplayName = fb.display_name;
          lessonIds = JSON.parse(fb.lesson_ids || '[]');
        }
      }
    }
    const lessons: any[] = [];
    for (const lid of lessonIds) {
      const lRes = await getDb().execute({ sql: "SELECT * FROM lessons WHERE id = ?", args: [lid] });
      if (lRes.rows.length > 0) {
        const l = lRes.rows[0] as any;
        lessons.push({ id: l.id, title: l.title, lesson_type: l.lesson_type, estimated_minutes: l.estimated_minutes, subject: l.subject, grade_level: l.grade_level, content_ref: l.content_ref });
      }
    }
    // Merge code-joined classes, deduping by id (a class may also be in the track)
    const seen = new Set(lessons.map(l => l.id));
    const mergedLessons = [...lessons, ...joinedLessons.filter(jl => !seen.has(jl.id))];
    return c.json({ track_id: trackId, display_name: trackDisplayName, grade_level: gradeLevel, country_code: country, lessons: mergedLessons });
  } catch (err: any) {
    return c.json({ error: "Failed to load curriculum track", details: err.message }, 500);
  }
});

curriculumRoutes.get("/lessons", async (c) => {
  const lessonId = c.req.query("lesson_id");
  if (!lessonId) return c.json({ error: "lesson_id required" }, 400);
  try {
    const result = await getDb().execute({ sql: "SELECT * FROM lessons WHERE id = ?", args: [lessonId] });
    if (result.rows.length === 0) return c.json({ error: "Lesson not found" }, 404);
    const l = result.rows[0] as any;
    return c.json({ id: l.id, title: l.title, description: l.description, subject: l.subject, grade_level: l.grade_level, lesson_type: l.lesson_type, estimated_minutes: l.estimated_minutes, content_ref: l.content_ref, quiz_ref: l.quiz_ref });
  } catch (err: any) {
    return c.json({ error: "Failed to load lesson", details: err.message }, 500);
  }
});
