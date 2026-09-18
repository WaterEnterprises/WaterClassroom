import { Hono } from "hono";
import { getDb } from "../db";

export const lessonRoutes = new Hono();

// Mounted at /api/lessons (preserves the original /api/lessons/component/:hash path)
lessonRoutes.get("/component/:hash", async (c) => {
  const hash = c.req.param("hash");
  if (!hash) return c.json({ error: "hash required" }, 400);
  try {
    // Studio classes take precedence: content_ref is the admin class id.
    const studioRes = await getDb().execute({ sql: "SELECT * FROM admin_classes WHERE id = ? AND is_published = 1", args: [hash] });
    if (studioRes.rows.length > 0) {
      const s = studioRes.rows[0] as any;
      return c.json({ id: s.id, title: s.title, subject: s.subject, grade_level: s.grade_level, lesson_type: s.game_path ? "game" : "content", content_ref: s.id });
    }
    const result = await getDb().execute({ sql: "SELECT * FROM lessons WHERE content_ref = ?", args: [hash] });
    if (result.rows.length === 0) return c.json({ error: "Lesson component not found" }, 404);
    const l = result.rows[0] as any;
    return c.json({ id: l.id, title: l.title, subject: l.subject, grade_level: l.grade_level, lesson_type: l.lesson_type, content_ref: l.content_ref });
  } catch (err: any) {
    return c.json({ error: "Failed to load lesson component", details: err.message }, 500);
  }
});
