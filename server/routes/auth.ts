import { Hono } from "hono";
import bcrypt from "bcryptjs";
import { getDb } from "../db";
import {
  findInviteByCode,
  findInviteInstitutionName,
  isInviteExpired,
  isInviteCode,
  normalizeInviteCode,
} from "../invites";
import {
  createSession,
  deleteSession,
  validateSession,
  setSessionCookie,
  clearSessionCookie,
  getSessionToken,
} from "../session";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const authRoutes = new Hono();

authRoutes.post("/register", async (c) => {
  try {
    const body = await c.req.json();
    const { type, name, email, representative, academicTrack, studentVolume, kindOfSchool, billingCycle, passcode, affiliatedCode } = body;

    const trimmedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const trimmedName = typeof name === 'string' ? name.trim() : '';
    const trimmedPasscode = typeof passcode === 'string' ? passcode : '';
    const trimmedRep = typeof representative === 'string' ? representative.trim() : '';
    let trimmedType = typeof type === 'string' ? type.trim() : '';
    const codeInput = typeof affiliatedCode === 'string' ? affiliatedCode.trim().toUpperCase() : '';

    if (!trimmedType || !trimmedEmail || !trimmedPasscode || !trimmedName) {
      const missing = [];
      if (!trimmedType) missing.push('type');
      if (!trimmedEmail) missing.push('email');
      if (!trimmedPasscode) missing.push('password');
      if (!trimmedName) missing.push('name');
      return c.json({ error: `Missing required fields: ${missing.join(', ')}.` }, 400);
    }
    if (!EMAIL_REGEX.test(trimmedEmail)) {
      return c.json({ error: 'Invalid email format.' }, 400);
    }
    if (trimmedPasscode.length < 6 || trimmedPasscode.length > 128) {
      return c.json({ error: 'Password must be between 6 and 128 characters.' }, 400);
    }
    if (trimmedType === "Institution" && !trimmedRep) {
      return c.json({ error: 'Representative name is required for institutions.' }, 400);
    }
    const VALID_TYPES = ['Water Student', 'Independent Student', 'School Student', 'Tutor', 'Institution'];
    if (!VALID_TYPES.includes(trimmedType)) {
      return c.json({ error: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}.` }, 400);
    }

    const existing = await getDb().execute({ sql: "SELECT id FROM turso_records WHERE email = ?", args: [trimmedEmail] });
    if (existing.rows.length > 0) {
      return c.json({ error: 'Email already registered. Please sign in.' }, 409);
    }

    // Per-student / per-tutor invite codes (School → Roster/Tutors → Add).
    // A matching unused invite links + activates the account instantly —
    // billed to the school. STU-/TUT- codes are STRICT: unknown/used/expired/
    // mismatched codes are rejected so a typo can never silently fall through
    // to a paid tier. Legacy/shared codes (WI-, WC-) keep the old
    // silent-fallback behavior.
    let invite: any = null;
    let inviteKind: "student" | "tutor" | null = null;
    if (codeInput) {
      if (isInviteCode(codeInput)) {
        const clean = normalizeInviteCode(codeInput);
        const found = await findInviteByCode(clean);
        if (!found) {
          return c.json({ error: "Invite code not found. Check the code from your school email or ask for a new one." }, 400);
        }
        const cand = found.row;
        if (cand.status !== "invited") {
          return c.json({ error: "This invite code has already been used. Ask your school for a new one." }, 410);
        }
        if (isInviteExpired(cand)) {
          return c.json({ error: "This invite code has expired. Ask your school for a new one." }, 410);
        }
        if (String(cand.email || "").toLowerCase() !== trimmedEmail) {
          return c.json({ error: "This invite code was issued for a different email address. Sign up with the email your school invited." }, 403);
        }
        invite = cand;
        inviteKind = found.kind;
        trimmedType = found.kind === "tutor" ? "Tutor" : "School Student";
      } else {
        const inv = await getDb().execute({ sql: "SELECT * FROM student_invites WHERE invite_code = ?", args: [codeInput] });
        if (inv.rows.length > 0) {
          const cand = inv.rows[0] as any;
          if (cand.status !== 'invited') {
            return c.json({ error: 'This invite code has already been used. Ask your school for a new one.' }, 410);
          }
          if (String(cand.email || '').toLowerCase() !== trimmedEmail) {
            return c.json({ error: 'This invite code was issued for a different email address.' }, 403);
          }
          invite = cand;
          trimmedType = 'School Student';
        }
      }
    }

    let calculatedPriceStr = "";
    let totalCents = 1900;
    if (trimmedType === "Institution") {
      const vol = Math.max(1, parseInt(typeof studentVolume === 'string' ? studentVolume : String(studentVolume)) || 1);
      const billingStr = typeof billingCycle === 'string' ? billingCycle.trim() : '';
      const multiplier = vol > 300 ? 0.8 : vol > 100 ? 0.9 : 1.0;
      if (billingStr === "Yearly") {
        const total = Math.floor(vol * 12 * 12 * multiplier);
        calculatedPriceStr = `$${total.toLocaleString()} / Year`;
        totalCents = total * 100;
      } else {
        const total = Math.floor(vol * 12 * multiplier);
        calculatedPriceStr = `$${total.toLocaleString()} / Month`;
        totalCents = total * 100;
      }
    } else if (trimmedType === "Water Student") { calculatedPriceStr = "$19 / Month"; totalCents = 1900; }
    else if (trimmedType === "Independent Student") { calculatedPriceStr = "$15 / Month"; totalCents = 1500; }
    else if (trimmedType === "School Student") { calculatedPriceStr = "$12 / Month"; totalCents = 1200; }

    const newId = `turso-${Date.now()}`;
    const now = new Date().toISOString();
    const hashedPasscode = await bcrypt.hash(trimmedPasscode, 12);
    // System-permission bootstrap: the FIRST institution to register becomes the
    // system owner with Class Studio (system dashboard) access. Later institutions
    // register without it and must be granted explicitly (bun run grant-system <email>).
    let hasSystemPermission = 0;
    if (trimmedType === "Institution") {
      const anyInstitution = await getDb().execute({ sql: "SELECT id FROM turso_records WHERE type = 'Institution' LIMIT 1" });
      if (anyInstitution.rows.length === 0) hasSystemPermission = 1;
    }
    await getDb().execute({
      sql: `INSERT INTO turso_records (id, type, name, email, representative, academicTrack, studentVolume, kindOfSchool, billingCycle, calculatedPrice, registeredAt, passcode, affiliatedCode, isActivated, hasSystemPermission, paid_seats) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        args: [newId, trimmedType, trimmedName, trimmedEmail, trimmedRep || trimmedName, (typeof academicTrack === 'string' ? academicTrack.trim() : '') || "",
        type === "Institution" ? Math.max(1, parseInt(studentVolume) || 1) : 1,
        (typeof kindOfSchool === 'string' ? kindOfSchool.trim() : '') || (trimmedType === "Institution" ? "Homeschool Co-Op" : "Homeschool Individual"),
        (typeof billingCycle === 'string' ? billingCycle.trim() : '') || "Monthly",
        calculatedPriceStr, now, hashedPasscode, (typeof affiliatedCode === 'string' ? affiliatedCode.trim() : '') || "", hasSystemPermission,
        // Seat quota: institutions start with their declared plan volume as paid
        // spots; additional spots are purchased (Stripe) and credited by webhook.
        trimmedType === "Institution" ? Math.max(1, parseInt(typeof studentVolume === 'string' ? studentVolume : String(studentVolume)) || 1) : 0],
    });

    // Claim the invite: link to the school, set grade, activate (billed to school).
    // Tutor invites additionally create the tutors-table row so class assignment works immediately.
    let finalAffiliated = (typeof affiliatedCode === 'string' ? affiliatedCode.trim() : '') || "";
    const isTutorClaim = !!invite && inviteKind === "tutor";
    if (invite) {
      const inst = await getDb().execute({ sql: "SELECT affiliatedCode, id FROM turso_records WHERE id = ?", args: [invite.institution_id] });
      const link = inst.rows.length > 0 ? ((inst.rows[0] as any).affiliatedCode || (inst.rows[0] as any).id) : invite.institution_id;
      finalAffiliated = link;
      if (isTutorClaim) {
        await getDb().execute({
          sql: `UPDATE turso_records SET type = 'Tutor', kindOfSchool = 'Tutor', gradeLevel = '', enrollmentType = 'tutor', affiliatedCode = ?, isActivated = 1 WHERE id = ?`,
          args: [link, newId],
        });
        const subjects = (() => { try { const p = JSON.parse(invite.subjects || "[]"); return Array.isArray(p) ? p : []; } catch { return []; } })();
        await getDb().execute({
          sql: `INSERT INTO tutors (id, institution_id, name, email, subjects, grade_levels, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO NOTHING`,
          args: [`tutor-${newId}`, invite.institution_id, trimmedName, trimmedEmail, JSON.stringify(subjects), JSON.stringify([]), now],
        });
      } else {
        await getDb().execute({
          sql: `UPDATE turso_records SET type = 'School Student', kindOfSchool = 'School-Enrolled Learner', gradeLevel = ?, enrollmentType = 'school-student', affiliatedCode = ?, isActivated = 1 WHERE id = ?`,
          args: [invite.grade_level || "5", link, newId],
        });
      }
      await getDb().execute({
        sql: `UPDATE ${isTutorClaim ? "tutor_invites" : "student_invites"} SET status = 'claimed', claimed_user_id = ?, claimed_at = ? WHERE id = ?`,
        args: [newId, now, invite.id],
      });
    }

    const finalType = invite ? (isTutorClaim ? "Tutor" : "School Student") : trimmedType;
    const finalKind = invite
      ? (isTutorClaim ? "Tutor" : "School-Enrolled Learner")
      : ((typeof kindOfSchool === 'string' ? kindOfSchool.trim() : '') || (trimmedType === "Institution" ? "Homeschool Co-Op" : "Homeschool Individual"));
    return c.json({ id: newId, type: finalType, name: trimmedName, email: trimmedEmail, representative: trimmedRep || trimmedName, academicTrack: "", studentVolume: type === "Institution" ? Math.max(1, parseInt(studentVolume) || 1) : 1, kindOfSchool: finalKind, billingCycle: (typeof billingCycle === 'string' ? billingCycle.trim() : '') || "Monthly", calculatedPrice: calculatedPriceStr, registeredAt: now, passcode: trimmedPasscode, affiliatedCode: finalAffiliated, isActivated: !!invite, checkoutUrl: null });
  } catch (err: any) {
    return c.json({ error: "Registration failed", details: err.message }, 400);
  }
});

// ─── Public invite lookup (powers the /join/:code landing + live code check) ───
// Minimal data only (no emails of others). Rate-limited per IP to block enumeration.
const lookupHits = new Map<string, { count: number; reset: number }>();

function lookupRateLimited(ip: string): boolean {
  const now = Date.now();
  const hit = lookupHits.get(ip);
  if (!hit || now > hit.reset) {
    lookupHits.set(ip, { count: 1, reset: now + 60_000 });
    return false;
  }
  hit.count += 1;
  return hit.count > 30;
}

authRoutes.get("/invites/:code/lookup", async (c) => {
  const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim()
    || c.req.header("cf-connecting-ip")
    || "unknown";
  if (lookupRateLimited(ip)) return c.json({ error: "Too many lookups — try again in a minute." }, 429);
  const clean = normalizeInviteCode(c.req.param("code"));
  if (!isInviteCode(clean)) return c.json({ error: "Invite code not found." }, 404);
  const found = await findInviteByCode(clean);
  if (!found) return c.json({ error: "Invite code not found." }, 404);
  const inv = found.row;
  if (inv.status !== "invited") return c.json({ error: "This invite code has already been used.", status: inv.status }, 410);
  if (isInviteExpired(inv)) return c.json({ error: "This invite code has expired.", status: "expired" }, 410);
  return c.json({
    valid: true,
    status: inv.status,
    kind: found.kind,
    school_name: await findInviteInstitutionName(inv.institution_id),
    student_name: inv.name || "",
    grade_level: inv.grade_level || "5",
    expires_at: inv.expires_at || "",
  });
});

authRoutes.post("/login", async (c) => {
  try {
    const body = await c.req.json();
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const passcode = typeof body.passcode === 'string' ? body.passcode : '';

    if (!email || !passcode) return c.json({ error: "Email and password required." }, 400);
    if (!EMAIL_REGEX.test(email)) return c.json({ error: 'Invalid email format.' }, 400);

    const result = await getDb().execute({ sql: "SELECT * FROM turso_records WHERE email = ?", args: [email] });
    if (result.rows.length > 0) {
      const user = { ...result.rows[0] } as any;
      const passwordMatch = await bcrypt.compare(passcode, user.passcode || "");
      if (!passwordMatch) {
        return c.json({ error: "Invalid email or password." }, 401);
      }

      // ─── Role resolution: credentials are verified first; the session role is
      // derived from the ACCOUNT TYPE, not from the door the client knocked on.
      // Tutors get Academy access like students, plus assigned classes and
      // forum moderation (checked against the account type server-side). ───
      const accountType = String(user.type || "");
      const sessionRole = accountType === "Institution" ? "institution" : accountType === "Tutor" ? "tutor" : "student";
      user.isActivated = !!result.rows[0].isActivated;
      user.hasSystemPermission = !!result.rows[0].hasSystemPermission;
      delete user.passcode;
      const token = await createSession(user.id, email, sessionRole as "institution" | "student" | "tutor");
      setSessionCookie(c, token);
      return c.json({ success: true, user });
    }
    return c.json({ error: "Invalid email or password." }, 401);
  } catch (err: any) {
    return c.json({ error: "Login failed", details: err.message }, 400);
  }
});

authRoutes.post("/logout", async (c) => {
  const token = getSessionToken(c);
  if (token) await deleteSession(token);
  clearSessionCookie(c);
  return c.json({ success: true });
});

authRoutes.get("/session", async (c) => {
  const token = getSessionToken(c);
  const session = await validateSession(token);
  if (!session) return c.json({ authenticated: false });
  try {
    const result = await getDb().execute({ sql: "SELECT * FROM turso_records WHERE id = ?", args: [session.userId] });
    if (result.rows.length > 0) {
      const user = { ...result.rows[0] } as any;
      user.isActivated = !!result.rows[0].isActivated;
      user.hasSystemPermission = !!result.rows[0].hasSystemPermission;
      delete user.passcode;
      return c.json({ authenticated: true, user });
    }
  } catch {}
  return c.json({ authenticated: false });
});
