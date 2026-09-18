import { Hono } from "hono";
import crypto from "crypto";
import { getDb } from "../db";
import { getSessionToken, validateSession } from "../session";

export const messageRoutes = new Hono();

// ─── Direct messages: users ↔ tutors ↔ school ───
// Conversations are scoped to your school: fellow students, tutors, and the
// institution itself. Message history is private to the two participants.

async function requireUser(c: any) {
  const token = getSessionToken(c);
  const session = await validateSession(token);
  if (!session) return { error: c.json({ error: "Unauthorized" }, 401) };
  const userRes = await getDb().execute({ sql: "SELECT * FROM turso_records WHERE id = ?", args: [session.userId] });
  if (userRes.rows.length === 0) return { error: c.json({ error: "User not found" }, 404) };
  return { user: userRes.rows[0] as any };
}

// Institution identity for scoping: own id, or the linked school.
function schoolOf(user: any): string {
  if (user.type === "Institution") return user.id;
  return user.affiliatedCode || "";
}

// People you can message: everyone in your school (students, tutors, school).
messageRoutes.get("/directory", async (c) => {
  const auth = await requireUser(c);
  if (auth.error) return auth.error;
  const me = auth.user as any;
  try {
    const schoolId = schoolOf(me);
    if (!schoolId) return c.json({ users: [] });
    // Resolve the institution row (link may be an id or an affiliatedCode).
    const instRes = await getDb().execute({
      sql: "SELECT id, name, affiliatedCode FROM turso_records WHERE type = 'Institution' AND (id = ? OR affiliatedCode = ?) LIMIT 1",
      args: [schoolId, schoolId],
    });
    if (instRes.rows.length === 0) return c.json({ users: [] });
    const inst = instRes.rows[0] as any;
    const link = inst.affiliatedCode || inst.id;
    const membersRes = await getDb().execute({
      sql: `SELECT id, name, email, type FROM turso_records
            WHERE (affiliatedCode = ? OR id = ?) AND id != ? AND type != 'Institution'
            ORDER BY name ASC LIMIT 200`,
      args: [link, inst.id, me.id],
    });
    const users = (membersRes.rows as any[]).map((r) => ({ id: r.id, name: r.name, email: r.email, type: r.type }));
    // The school itself (unless you are the school).
    if (me.type !== "Institution") {
      users.unshift({ id: inst.id, name: inst.name, email: "", type: "Institution" });
    }
    return c.json({ users });
  } catch (err: any) {
    return c.json({ error: "Failed to load directory", details: err.message }, 500);
  }
});

// Conversation list: latest message per counterpart + unread counts.
messageRoutes.get("/conversations", async (c) => {
  const auth = await requireUser(c);
  if (auth.error) return auth.error;
  const me = (auth.user as any).id;
  try {
    const res = await getDb().execute({
      sql: `SELECT m.*, u.name AS other_name, u.type AS other_type
            FROM direct_messages m
            JOIN turso_records u ON u.id = CASE WHEN m.sender_id = ? THEN m.recipient_id ELSE m.sender_id END
            WHERE m.sender_id = ? OR m.recipient_id = ?
            ORDER BY m.created_at DESC`,
      args: [me, me, me],
    });
    const seen = new Map<string, any>();
    for (const row of res.rows as any[]) {
      const otherId = row.sender_id === me ? row.recipient_id : row.sender_id;
      if (!seen.has(otherId)) {
        seen.set(otherId, {
          user_id: otherId,
          name: row.other_name || "User",
          type: row.other_type || "",
          last_content: row.content,
          last_at: row.created_at,
          last_from_me: row.sender_id === me,
          unread: 0,
        });
      }
      if (row.recipient_id === me && !row.is_read) {
        seen.get(otherId).unread += 1;
      }
    }
    const conversations = [...seen.values()];
    const totalUnread = conversations.reduce((n, cv) => n + cv.unread, 0);
    return c.json({ conversations, total_unread: totalUnread });
  } catch (err: any) {
    return c.json({ error: "Failed to load conversations", details: err.message }, 500);
  }
});

// Thread with one user (marks their messages read).
messageRoutes.get("/with/:userId", async (c) => {
  const auth = await requireUser(c);
  if (auth.error) return auth.error;
  const me = (auth.user as any).id;
  const otherId = c.req.param("userId");
  try {
    const otherRes = await getDb().execute({ sql: "SELECT id, name, type FROM turso_records WHERE id = ?", args: [otherId] });
    if (otherRes.rows.length === 0) return c.json({ error: "User not found" }, 404);
    const res = await getDb().execute({
      sql: `SELECT * FROM direct_messages
            WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)
            ORDER BY created_at ASC LIMIT 500`,
      args: [me, otherId, otherId, me],
    });
    await getDb().execute({
      sql: "UPDATE direct_messages SET is_read = 1 WHERE sender_id = ? AND recipient_id = ?",
      args: [otherId, me],
    });
    const other = otherRes.rows[0] as any;
    return c.json({
      other: { id: other.id, name: other.name, type: other.type },
      messages: (res.rows as any[]).map((r) => ({
        id: r.id, sender_id: r.sender_id, content: r.content,
        is_read: !!r.is_read, created_at: r.created_at,
      })),
    });
  } catch (err: any) {
    return c.json({ error: "Failed to load thread", details: err.message }, 500);
  }
});

// Send a message (recipient must exist; cross-school messaging is blocked
// unless one side is the other's institution — directory enforces this in UI,
// and the server re-checks school scope here).
messageRoutes.post("/", async (c) => {
  const auth = await requireUser(c);
  if (auth.error) return auth.error;
  const me = auth.user as any;
  try {
    const { recipient_id, content } = await c.req.json();
    const clean = String(content || "").trim();
    if (!recipient_id || !clean) return c.json({ error: "Recipient and message required" }, 400);
    if (clean.length > 2000) return c.json({ error: "Message too long (max 2000 characters)" }, 400);
    const recipRes = await getDb().execute({ sql: "SELECT * FROM turso_records WHERE id = ?", args: [recipient_id] });
    if (recipRes.rows.length === 0) return c.json({ error: "Recipient not found" }, 404);
    const recip = recipRes.rows[0] as any;
    if (String(recip.id) === String(me.id)) return c.json({ error: "You cannot message yourself" }, 400);
    const mySchool = schoolOf(me);
    const theirSchool = schoolOf(recip);
    const sameSchool = !!mySchool && (!!theirSchool
      ? (theirSchool === mySchool || recip.id === mySchool || me.id === theirSchool)
      : (recip.affiliatedCode === mySchool || String(recip.id) === String(mySchool)));
    const involvesInstitution =
      me.type === "Institution" || recip.type === "Institution";
    if (!sameSchool && !involvesInstitution) {
      // No shared school and no institution party — block directory bypasses.
      const meLink = me.affiliatedCode || me.id;
      const recipLink = recip.affiliatedCode || recip.id;
      if (meLink !== recipLink) return c.json({ error: "You can only message people in your school" }, 403);
    }
    const id = `dm-${crypto.randomBytes(8).toString("hex")}`;
    const now = new Date().toISOString();
    await getDb().execute({
      sql: "INSERT INTO direct_messages (id, sender_id, recipient_id, content, is_read, created_at) VALUES (?, ?, ?, ?, 0, ?)",
      args: [id, me.id, recip.id, clean, now],
    });
    return c.json({ id, sender_id: me.id, content: clean, is_read: false, created_at: now }, 201);
  } catch (err: any) {
    return c.json({ error: "Failed to send message", details: err.message }, 500);
  }
});
