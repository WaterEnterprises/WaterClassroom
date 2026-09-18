import { getDb } from "./db";

// ─── Student invite helpers (shared by auth + institution routes) ───
// Per-student codes look like STU-XXXXXX. Legacy/shared codes (WI-, WC-)
// are NOT student invites and keep the old silent-fallback behavior.

export const INVITE_CODE_PREFIX = "STU-";
export const TUTOR_INVITE_CODE_PREFIX = "TUT-";

export type InviteKind = "student" | "tutor";

export function inviteKindOf(code: unknown): InviteKind | null {
  if (typeof code !== "string") return null;
  const clean = code.trim().toUpperCase();
  if (clean.startsWith(TUTOR_INVITE_CODE_PREFIX)) return "tutor";
  if (clean.startsWith(INVITE_CODE_PREFIX)) return "student";
  return null;
}

export function isStudentInviteCode(code: unknown): boolean {
  return inviteKindOf(code) === "student";
}

export function isTutorInviteCode(code: unknown): boolean {
  return inviteKindOf(code) === "tutor";
}

export function isInviteCode(code: unknown): boolean {
  return inviteKindOf(code) !== null;
}

export function normalizeInviteCode(code: unknown): string {
  return typeof code === "string" ? code.trim().toUpperCase() : "";
}

export function getInviteExpiryDays(): number {
  const raw = Number(process.env.INVITE_EXPIRY_DAYS || "14");
  if (!Number.isFinite(raw) || raw <= 0) return 14;
  return Math.floor(raw);
}

export function inviteExpiresAt(from = new Date()): string {
  return new Date(from.getTime() + getInviteExpiryDays() * 24 * 60 * 60 * 1000).toISOString();
}

export function isInviteExpired(row: any): boolean {
  const exp = String(row?.expires_at || "");
  if (!exp) return false; // legacy rows without expiry never expire
  return new Date(exp).getTime() < Date.now();
}

export function buildInviteLink(code: string): string {
  const base = String(process.env.APP_URL || "").trim().replace(/\/+$/, "");
  const clean = normalizeInviteCode(code);
  if (base) return `${base}/join/${clean}`;
  return `/join/${clean}`;
}

export async function findInviteByCode(code: string): Promise<{ kind: InviteKind; row: any } | null> {
  const clean = normalizeInviteCode(code);
  if (!clean) return null;
  const kind = inviteKindOf(clean);
  if (!kind) return null;
  const table = kind === "tutor" ? "tutor_invites" : "student_invites";
  const res = await getDb().execute({
    sql: `SELECT * FROM ${table} WHERE invite_code = ?`,
    args: [clean],
  });
  if (res.rows.length === 0) return null;
  return { kind, row: res.rows[0] as any };
}

export async function findInviteInstitutionName(institutionId: string): Promise<string> {
  try {
    const res = await getDb().execute({
      sql: "SELECT name FROM turso_records WHERE id = ?",
      args: [institutionId],
    });
    return String((res.rows[0] as any)?.name || "Your school");
  } catch {
    return "Your school";
  }
}
