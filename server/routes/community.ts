import { Hono } from "hono";
import { getDb } from "../db";
import { getSessionToken, validateSession } from "../session";

export const communityRoutes = new Hono();

communityRoutes.get("/topics", async (c) => {
  const token = getSessionToken(c);
  const session = await validateSession(token);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  try {
    const tracksRes = await getDb().execute({ sql: "SELECT DISTINCT grade_level FROM curriculum_tracks ORDER BY grade_level" });
    const topics = tracksRes.rows.map((t: any) => ({
      id: `grade-${t.grade_level}`,
      label: `Grade ${t.grade_level}`,
      subtopics: ["All", "General", "Mathematics", "Science", "English", "Visual Arts", "Robotics", "Creed", "Human Dynamics"]
    }));
    return c.json({ topics });
  } catch (err: any) {
    return c.json({ error: "Failed to load topics", details: err.message }, 500);
  }
});

communityRoutes.get("/posts", async (c) => {
  const token = getSessionToken(c);
  const session = await validateSession(token);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  try {
    const topicId = c.req.query("topic_id") || "grade-all";
    const subject = c.req.query("subject") || "";
    const limit = parseInt(c.req.query("limit") || "20");
    const offset = parseInt(c.req.query("offset") || "0");
    let sql = "SELECT * FROM community_posts WHERE moderation_status = 'approved'";
    const args: any[] = [];
    if (topicId.startsWith("grade-")) {
      const gradeLevel = topicId.replace("grade-", "");
      // "grade-all" means every grade — no grade filter.
      if (gradeLevel && gradeLevel !== "all") {
        sql += " AND grade_level = ?";
        args.push(gradeLevel);
      }
    }
    if (subject && subject !== "All") {
      sql += " AND category = ?";
      args.push(subject);
    }
    sql += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
    args.push(limit, offset);
    const result = await getDb().execute({ sql, args });
    const posts = result.rows.map((p: any) => ({
      id: p.id, author_name: p.author_name, author_level: p.author_level, title: p.title, content: p.content,
      likes: p.likes, replies: p.replies, category: p.category, created_at: p.created_at
    }));
    return c.json({ posts });
  } catch (err: any) {
    return c.json({ error: "Failed to load posts", details: err.message }, 500);
  }
});

communityRoutes.post("/posts", async (c) => {
  const token = getSessionToken(c);
  const session = await validateSession(token);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  try {
    const { title, content, category, grade_level } = await c.req.json();
    if (!title || !content) return c.json({ error: "Title and content required" }, 400);
    const userRes = await getDb().execute({ sql: "SELECT * FROM turso_records WHERE id = ?", args: [session.userId] });
    if (userRes.rows.length === 0) return c.json({ error: "Account not found — please sign in again" }, 404);
    const user = userRes.rows[0] as any;
    // Threads go live immediately — no approval queue.
    const status = "approved";
    const postId = `post-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    await getDb().execute({
      sql: `INSERT INTO community_posts (id, author_id, author_name, author_level, title, content, category, grade_level, moderation_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [postId, session.userId, user.name || "Student", 1, title, content, category || "General", grade_level || user.gradeLevel || "all", status, new Date().toISOString()],
    });
    return c.json({ id: postId, status }, 201);
  } catch (err: any) {
    return c.json({ error: "Failed to create post", details: err.message }, 500);
  }
});

communityRoutes.post("/posts/:id/like", async (c) => {
  const token = getSessionToken(c);
  const session = await validateSession(token);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  try {
    const postId = c.req.param("id");
    await getDb().execute({ sql: "UPDATE community_posts SET likes = likes + 1 WHERE id = ?", args: [postId] });
    const res = await getDb().execute({ sql: "SELECT likes FROM community_posts WHERE id = ?", args: [postId] });
    return c.json({ id: postId, likes: (res.rows[0] as any).likes });
  } catch (err: any) {
    return c.json({ error: "Failed to like post", details: err.message }, 500);
  }
});

// ─── Moderation (tutors + institutions) ───
communityRoutes.delete("/posts/:id", async (c) => {
  const token = getSessionToken(c);
  const session = await validateSession(token);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  try {
    const userRes = await getDb().execute({ sql: "SELECT type FROM turso_records WHERE id = ?", args: [session.userId] });
    if (userRes.rows.length === 0) return c.json({ error: "User not found" }, 404);
    const type = String((userRes.rows[0] as any).type || "");
    if (type !== "Tutor" && type !== "Institution") {
      return c.json({ error: "Forbidden — tutor or institution account required" }, 403);
    }
    await getDb().execute({ sql: "DELETE FROM community_replies WHERE post_id = ?", args: [c.req.param("id")] });
    await getDb().execute({ sql: "DELETE FROM community_posts WHERE id = ?", args: [c.req.param("id")] });
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: "Failed to delete post", details: err.message }, 500);
  }
});

// ─── Threads: replies on a post ───

// List a thread's replies (oldest first)
communityRoutes.get("/posts/:id/replies", async (c) => {
  const token = getSessionToken(c);
  const session = await validateSession(token);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  try {
    const res = await getDb().execute({
      sql: "SELECT * FROM community_replies WHERE post_id = ? ORDER BY created_at ASC",
      args: [c.req.param("id")],
    });
    return c.json({
      replies: (res.rows as any[]).map((r) => ({
        id: r.id, post_id: r.post_id, author_name: r.author_name, author_level: r.author_level,
        content: r.content, likes: r.likes, created_at: r.created_at,
      })),
    });
  } catch (err: any) {
    return c.json({ error: "Failed to load replies", details: err.message }, 500);
  }
});

// Post a reply on a thread
communityRoutes.post("/posts/:id/replies", async (c) => {
  const token = getSessionToken(c);
  const session = await validateSession(token);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  try {
    const { content } = await c.req.json();
    if (!String(content || "").trim()) return c.json({ error: "Reply content required" }, 400);
    const postRes = await getDb().execute({ sql: "SELECT id FROM community_posts WHERE id = ?", args: [c.req.param("id")] });
    if (postRes.rows.length === 0) return c.json({ error: "Thread not found" }, 404);
    const userRes = await getDb().execute({ sql: "SELECT name FROM turso_records WHERE id = ?", args: [session.userId] });
    const authorName = (userRes.rows[0] as any)?.name || "Student";
    const replyId = `reply-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();
    await getDb().execute({
      sql: `INSERT INTO community_replies (id, post_id, author_id, author_name, author_level, content, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [replyId, c.req.param("id"), session.userId, authorName, 1, String(content).trim(), now],
    });
    await getDb().execute({ sql: "UPDATE community_posts SET replies = replies + 1 WHERE id = ?", args: [c.req.param("id")] });
    return c.json({ id: replyId, post_id: c.req.param("id"), author_name: authorName, author_level: 1, content: String(content).trim(), likes: 0, created_at: now }, 201);
  } catch (err: any) {
    return c.json({ error: "Failed to post reply", details: err.message }, 500);
  }
});

// Like a reply
communityRoutes.post("/replies/:id/like", async (c) => {
  const token = getSessionToken(c);
  const session = await validateSession(token);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  try {
    const replyId = c.req.param("id");
    await getDb().execute({ sql: "UPDATE community_replies SET likes = likes + 1 WHERE id = ?", args: [replyId] });
    const res = await getDb().execute({ sql: "SELECT likes FROM community_replies WHERE id = ?", args: [replyId] });
    if (res.rows.length === 0) return c.json({ error: "Reply not found" }, 404);
    return c.json({ id: replyId, likes: (res.rows[0] as any).likes });
  } catch (err: any) {
    return c.json({ error: "Failed to like reply", details: err.message }, 500);
  }
});

// Delete a reply (author or moderator)
communityRoutes.delete("/replies/:id", async (c) => {
  const token = getSessionToken(c);
  const session = await validateSession(token);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  try {
    const own = await getDb().execute({ sql: "SELECT * FROM community_replies WHERE id = ?", args: [c.req.param("id")] });
    if (own.rows.length === 0) return c.json({ error: "Reply not found" }, 404);
    const reply = own.rows[0] as any;
    const userRes = await getDb().execute({ sql: "SELECT type FROM turso_records WHERE id = ?", args: [session.userId] });
    const type = String((userRes.rows[0] as any)?.type || "");
    const isAuthor = reply.author_id === session.userId;
    if (!isAuthor && type !== "Tutor" && type !== "Institution") {
      return c.json({ error: "Forbidden" }, 403);
    }
    await getDb().execute({ sql: "DELETE FROM community_replies WHERE id = ?", args: [c.req.param("id")] });
    await getDb().execute({ sql: "UPDATE community_posts SET replies = MAX(replies - 1, 0) WHERE id = ?", args: [reply.post_id] });
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: "Failed to delete reply", details: err.message }, 500);
  }
});
