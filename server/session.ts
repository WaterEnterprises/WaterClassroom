import crypto from "crypto";
import { getDb } from "./db";

export const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export async function createSession(userId: string, email: string, role: string = "student"): Promise<string> {
  const token = generateSessionToken();
  const now = Date.now();
  const expiresAt = now + SESSION_DURATION_MS;
  await getDb().execute({
    sql: "INSERT INTO sessions (token, userId, email, role, createdAt, expiresAt) VALUES (?, ?, ?, ?, ?, ?)",
    args: [token, userId, email, role, now, expiresAt],
  });
  return token;
}

export async function validateSession(token: string): Promise<{ userId: string; email: string; role: string } | null> {
  if (!token) return null;
  try {
    const result = await getDb().execute({
      sql: "SELECT * FROM sessions WHERE token = ? AND expiresAt > ?",
      args: [token, Date.now()],
    });
    if (result.rows.length > 0) {
      return {
        userId: result.rows[0].userId as string,
        email: result.rows[0].email as string,
        // Sessions created before role-binding default to 'student'
        role: (result.rows[0].role as string) || "student",
      };
    }
  } catch {}
  return null;
}

export async function deleteSession(token: string) {
  try {
    await getDb().execute({ sql: "DELETE FROM sessions WHERE token = ?", args: [token] });
  } catch {}
}

export function setSessionCookie(c: any, token: string) {
  c.header("Set-Cookie", `session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_DURATION_MS / 1000}`);
}

export function clearSessionCookie(c: any) {
  c.header("Set-Cookie", "session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0");
}

export function getSessionToken(c: any): string {
  const cookie = c.req.header("cookie") || "";
  const match = cookie.match(/session=([^;]+)/);
  return match ? match[1] : "";
}
