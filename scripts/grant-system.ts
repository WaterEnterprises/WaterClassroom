/**
 * Grant or revoke system-dashboard (Class Studio) permission for an institution account.
 *
 * Usage:
 *   bun run grant-system dean@school.edu          # grant
 *   bun run grant-system dean@school.edu --revoke # revoke
 *
 * The first institution to register auto-receives system permission (bootstrap owner).
 */
import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url || !authToken) {
  console.error("❌ TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set (e.g. from your .env).");
  process.exit(1);
}

const email = process.argv[2]?.trim().toLowerCase();
const revoke = process.argv.includes("--revoke");

if (!email) {
  console.error("Usage: bun run grant-system <email> [--revoke]");
  process.exit(1);
}

const db = createClient({ url, authToken });

// Ensure the column exists (idempotent, matches server/db.ts migration)
try {
  const cols = await db.execute("PRAGMA table_info(turso_records)");
  const names = cols.rows.map((r: any) => r.name);
  if (!names.includes("hasSystemPermission")) {
    await db.execute("ALTER TABLE turso_records ADD COLUMN hasSystemPermission INTEGER DEFAULT 0");
  }
  if (!names.includes("type")) {
    console.error("❌ turso_records table not initialized. Start the server once first.");
    process.exit(1);
  }
} catch { /* table may not exist yet */ }

const userRes = await db.execute({ sql: "SELECT id, name, type, hasSystemPermission FROM turso_records WHERE email = ?", args: [email] });
if (userRes.rows.length === 0) {
  console.error(`❌ No account found for ${email}`);
  process.exit(1);
}
const user = userRes.rows[0] as any;
if (user.type !== "Institution") {
  console.error(`❌ ${email} is a ${user.type} account — only institution accounts can hold system permission.`);
  process.exit(1);
}

const next = revoke ? 0 : 1;
await db.execute({ sql: "UPDATE turso_records SET hasSystemPermission = ? WHERE id = ?", args: [next, user.id] });
console.log(revoke
  ? `🚫 Revoked system permission from ${user.name} <${email}>`
  : `✅ Granted system permission to ${user.name} <${email}> — the Studio tab and Class Studio dashboard are now available after login.`);
