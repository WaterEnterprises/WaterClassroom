import { Hono } from "hono";
import { getDb } from "../db";
import { getSessionToken, validateSession } from "../session";

export const userRoutes = new Hono();

// The logged-in user's institution (for Academy's institution-first browsing).
// Institutions get themselves; students/tutors get the school they're linked to.
userRoutes.get("/my-institution", async (c) => {
  const token = getSessionToken(c);
  const session = await validateSession(token);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  try {
    const userRes = await getDb().execute({ sql: "SELECT * FROM turso_records WHERE id = ?", args: [session.userId] });
    if (userRes.rows.length === 0) return c.json({ error: "User not found" }, 404);
    const user = userRes.rows[0] as any;
    if (user.type === "Institution") {
      return c.json({ institution: { id: user.id, name: user.name } });
    }
    const link = String(user.affiliatedCode || "");
    if (!link) return c.json({ institution: null });
    const instRes = await getDb().execute({
      sql: "SELECT id, name FROM turso_records WHERE type = 'Institution' AND (id = ? OR affiliatedCode = ?) LIMIT 1",
      args: [link, link],
    });
    if (instRes.rows.length === 0) return c.json({ institution: null });
    return c.json({ institution: { id: (instRes.rows[0] as any).id, name: (instRes.rows[0] as any).name } });
  } catch (err: any) {
    return c.json({ error: "Failed to load institution", details: err.message }, 500);
  }
});

userRoutes.get("/records", async (c) => {
  const result = await getDb().execute("SELECT * FROM turso_records ORDER BY registeredAt DESC");
  return c.json(result.rows);
});

userRoutes.post("/update-user", async (c) => {
  try {
    const body = await c.req.json();
    const { email, type, kindOfSchool, academicTrack, billingCycle, country, gradeLevel, enrollmentType, isOnboarded } = body;
    if (!email) return c.json({ error: "Email is required" }, 400);
    const trimmedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    await getDb().execute({
      sql: `UPDATE turso_records SET
        type = COALESCE(?, type),
        kindOfSchool = COALESCE(?, kindOfSchool),
        academicTrack = COALESCE(?, academicTrack),
        billingCycle = COALESCE(?, billingCycle),
        country = COALESCE(?, country),
        gradeLevel = COALESCE(?, gradeLevel),
        enrollmentType = COALESCE(?, enrollmentType),
        isOnboarded = COALESCE(?, isOnboarded)
        WHERE email = ?`,
      args: [type || null, kindOfSchool || null, academicTrack || null, billingCycle || null, country || null, gradeLevel || null, enrollmentType || null, isOnboarded != null ? (isOnboarded ? 1 : 0) : null, trimmedEmail],
    });
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: "Update failed", details: err.message }, 400);
  }
});

userRoutes.post("/activate-user", async (c) => {
  try {
    const body = await c.req.json();
    const { email } = body;
    if (!email) return c.json({ error: "Email is required" }, 400);
    const trimmedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    await getDb().execute({ sql: `UPDATE turso_records SET isActivated = 1 WHERE email = ?`, args: [trimmedEmail] });
    return c.json({ success: true, activated: true });
  } catch (err: any) {
    return c.json({ error: "Activation failed", details: err.message }, 400);
  }
});
