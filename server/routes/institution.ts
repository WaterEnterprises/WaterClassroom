import { Hono } from "hono";
import crypto from "crypto";
import { getDb } from "../db";
import { getSessionToken, validateSession } from "../session";
import { buildInviteLink, inviteExpiresAt } from "../invites";
import { isEmailConfigured, sendInviteEmail } from "../email";
import { readLessonBody } from "../lesson-files";

export const institutionRoutes = new Hono();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function requireInstitution(c: any) {
  const token = getSessionToken(c);
  const session = await validateSession(token);
  if (!session) return { error: c.json({ error: "Unauthorized" }, 401) };
  const userRes = await getDb().execute({ sql: "SELECT * FROM turso_records WHERE id = ?", args: [session.userId] });
  if (userRes.rows.length === 0) return { error: c.json({ error: "User not found" }, 404) };
  const user = userRes.rows[0] as any;
  if (user.type !== "Institution") return { error: c.json({ error: "Forbidden" }, 403) };
  return { user };
}

function newInviteCode(): string {
  // e.g. STU-7F3K2M — unambiguous charset (no I, L, O, 0, 1)
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += alphabet[crypto.randomInt(alphabet.length)];
  return `STU-${code}`;
}

function newTutorInviteCode(): string {
  // e.g. TUT-7F3K2M — unambiguous charset (no I, L, O, 0, 1)
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += alphabet[crypto.randomInt(alphabet.length)];
  return `TUT-${code}`;
}

function safeParseSubjects(input: unknown): string[] {
  if (Array.isArray(input)) return input.map(String).filter(Boolean).slice(0, 12);
  if (typeof input === "string" && input.trim()) return input.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 12);
  return [];
}

// Seat usage: paid spots vs consumed (enrolled students + pending invites).
// Tutors are staff and never consume student spots.
export async function getSeatUsage(institutionId: string, link: string): Promise<{ paid_seats: number; used_seats: number }> {
  const instRes = await getDb().execute({ sql: "SELECT paid_seats, studentVolume FROM turso_records WHERE id = ?", args: [institutionId] });
  const row = (instRes.rows[0] as any) || {};
  const paid = Number(row.paid_seats || 0) > 0 ? Number(row.paid_seats) : Math.max(1, Number(row.studentVolume) || 1);
  const [studentsRes, pendingRes] = await Promise.all([
    getDb().execute({ sql: "SELECT COUNT(*) AS n FROM turso_records WHERE affiliatedCode = ? AND type != 'Institution' AND type != 'Tutor'", args: [link] }),
    getDb().execute({ sql: "SELECT COUNT(*) AS n FROM student_invites WHERE institution_id = ? AND status = 'invited'", args: [institutionId] }),
  ]);
  const used = Number((studentsRes.rows[0] as any)?.n || 0) + Number((pendingRes.rows[0] as any)?.n || 0);
  return { paid_seats: paid, used_seats: used };
}

institutionRoutes.get("/roster", async (c) => {
  const token = getSessionToken(c);
  const session = await validateSession(token);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  try {
    const userRes = await getDb().execute({ sql: "SELECT * FROM turso_records WHERE id = ?", args: [session.userId] });
    if (userRes.rows.length === 0) return c.json({ error: "User not found" }, 404);
    const user = userRes.rows[0] as any;
    if (user.type !== "Institution") return c.json({ error: "Forbidden" }, 403);
    const affiliatedCode = user.affiliatedCode || user.id;
    const studentsRes = await getDb().execute({ sql: "SELECT tr.*, sp.points, sp.streakDays, sp.level, sp.lastActiveDate FROM turso_records tr LEFT JOIN student_progress sp ON sp.id = tr.id WHERE tr.affiliatedCode = ? AND tr.type != 'Institution' AND tr.type != 'Tutor'", args: [affiliatedCode] });
    const students = studentsRes.rows.map((s: any) => ({
      id: s.id, name: s.name, email: s.email, grade_level: s.gradeLevel, enrollment_type: s.enrollmentType,
      points: s.points || 0, streak_days: s.streakDays || 0, level: s.level || 1, last_active: s.lastActiveDate || ""
    }));
    const seats = await getSeatUsage(user.id, affiliatedCode);
    return c.json({ institution_id: user.id, institution_name: user.name, students, paid_seats: seats.paid_seats, used_seats: seats.used_seats });
  } catch (err: any) {
    return c.json({ error: "Failed to load roster", details: err.message }, 500);
  }
});

// ─── Per-student signup codes ───
// Adding a student in the School roster generates a UNIQUE invite code.
// The student pastes it into the "School Enrollment Code" field at
// registration and is instantly linked + activated — no payment step.

// List this institution's invites (pending + claimed).
institutionRoutes.get("/roster/invites", async (c) => {
  const auth = await requireInstitution(c);
  if (auth.error) return auth.error;
  try {
    const res = await getDb().execute({
      sql: `SELECT i.*, u.name AS claimed_name FROM student_invites i
            LEFT JOIN turso_records u ON u.id = i.claimed_user_id
            WHERE i.institution_id = ? ORDER BY i.created_at DESC`,
      args: [(auth.user as any).id],
    });
    return c.json({
      invites: (res.rows as any[]).map((r) => ({
        id: r.id, name: r.name, email: r.email, grade_level: r.grade_level,
        invite_code: r.invite_code, status: r.status,
        claimed_name: r.claimed_name || "", created_at: r.created_at, claimed_at: r.claimed_at || "",
        expires_at: r.expires_at || "", last_emailed_at: r.last_emailed_at || "",
        email_status: r.email_status || "unsent",
        invite_link: buildInviteLink(r.invite_code),
      })),
    });
  } catch (err: any) {
    return c.json({ error: "Failed to load invites", details: err.message }, 500);
  }
});

// Add a student → generates their unique signup code.
institutionRoutes.post("/roster/invite", async (c) => {
  const auth = await requireInstitution(c);
  if (auth.error) return auth.error;
  const user = auth.user as any;
  try {
    const { name, email, grade_level } = await c.req.json();
    const cleanName = typeof name === "string" ? name.trim() : "";
    const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    if (!cleanName || !cleanEmail) return c.json({ error: "Name and email required" }, 400);
    if (!EMAIL_REGEX.test(cleanEmail)) return c.json({ error: "Invalid email format." }, 400);
    const taken = await getDb().execute({ sql: "SELECT id FROM turso_records WHERE email = ?", args: [cleanEmail] });
    if (taken.rows.length > 0) return c.json({ error: "This email is already registered. Ask them to sign in instead." }, 409);
    const pending = await getDb().execute({ sql: "SELECT id FROM student_invites WHERE email = ? AND status = 'invited'", args: [cleanEmail] });
    if (pending.rows.length > 0) return c.json({ error: "This email already has a pending invite code." }, 409);
    // Seat enforcement: the institution can only fill spots it has paid for.
    const seats = await getSeatUsage(user.id, user.affiliatedCode || user.id);
    if (seats.used_seats >= seats.paid_seats) {
      return c.json({ error: `No student spots left (${seats.used_seats}/${seats.paid_seats} used). Buy more spots in Settings to add students.` }, 403);
    }
    // Unique code (retry on the astronomically unlikely collision).
    let code = "";
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = newInviteCode();
      const clash = await getDb().execute({ sql: "SELECT id FROM student_invites WHERE invite_code = ?", args: [candidate] });
      if (clash.rows.length === 0) { code = candidate; break; }
    }
    if (!code) return c.json({ error: "Could not generate a code — try again." }, 500);
    const id = `inv-${crypto.randomBytes(6).toString("hex")}`;
    const now = new Date().toISOString();
    const expiresAt = inviteExpiresAt();
    await getDb().execute({
      sql: `INSERT INTO student_invites (id, institution_id, name, email, grade_level, invite_code, status, created_at, expires_at)
            VALUES (?, ?, ?, ?, ?, ?, 'invited', ?, ?)`,
      args: [id, user.id, cleanName, cleanEmail, (typeof grade_level === "string" && grade_level.trim()) || "5", code, now, expiresAt],
    });
    return c.json({ id, name: cleanName, email: cleanEmail, grade_level: (typeof grade_level === "string" && grade_level.trim()) || "5", invite_code: code, status: "invited", created_at: now, expires_at: expiresAt, invite_link: buildInviteLink(code) }, 201);
  } catch (err: any) {
    return c.json({ error: "Failed to invite student", details: err.message }, 500);
  }
});

// Email a pending invite: sends the code + click-to-join link to the student.
// POST /api/institution/roster/invites/:id/send-email
institutionRoutes.post("/roster/invites/:id/send-email", async (c) => {
  const auth = await requireInstitution(c);
  if (auth.error) return auth.error;
  try {
    const own = await getDb().execute({
      sql: "SELECT * FROM student_invites WHERE id = ? AND institution_id = ?",
      args: [c.req.param("id"), (auth.user as any).id],
    });
    if (own.rows.length === 0) return c.json({ error: "Invite not found" }, 404);
    const inv = own.rows[0] as any;
    if (inv.status !== "invited") return c.json({ error: "This code was already claimed and cannot be emailed." }, 409);
    if (!isEmailConfigured()) {
      return c.json({ error: "Email not configured on the server (RESEND_API_KEY). Copy the link instead.", invite_link: buildInviteLink(inv.invite_code) }, 503);
    }
    const schoolName = String((auth.user as any).name || "Your school");
    const link = buildInviteLink(inv.invite_code);
    await sendInviteEmail({
      to: inv.email,
      studentName: inv.name || "Student",
      schoolName,
      code: inv.invite_code,
      link,
      gradeLevel: inv.grade_level || "5",
      expiresAt: inv.expires_at || "",
    });
    const now = new Date().toISOString();
    await getDb().execute({
      sql: "UPDATE student_invites SET last_emailed_at = ?, email_status = 'sent' WHERE id = ?",
      args: [now, inv.id],
    });
    return c.json({ success: true, invite_link: link, emailed_at: now });
  } catch (err: any) {
    try {
      await getDb().execute({
        sql: "UPDATE student_invites SET email_status = 'failed' WHERE id = ?",
        args: [c.req.param("id")],
      });
    } catch { /* status update is best-effort */ }
    return c.json({ error: err.message || "Failed to send email" }, 500);
  }
});

// Revoke an unclaimed invite.
institutionRoutes.delete("/roster/invites/:id", async (c) => {
  const auth = await requireInstitution(c);
  if (auth.error) return auth.error;
  try {
    const own = await getDb().execute({ sql: "SELECT * FROM student_invites WHERE id = ? AND institution_id = ?", args: [c.req.param("id"), (auth.user as any).id] });
    if (own.rows.length === 0) return c.json({ error: "Invite not found" }, 404);
    if ((own.rows[0] as any).status !== "invited") return c.json({ error: "This code was already claimed and cannot be revoked." }, 409);
    await getDb().execute({ sql: "DELETE FROM student_invites WHERE id = ?", args: [c.req.param("id")] });
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: "Failed to revoke invite", details: err.message }, 500);
  }
});

// ─── Per-tutor signup codes ───
// Same flow as student invites, but the code (TUT-XXXXXX) creates a TUTOR
// account: student-equivalent access plus assigned classes/students and
// forum moderation. Managed from School → Tutors → Add Tutor.

// List this institution's tutor invites (pending + claimed).
institutionRoutes.get("/roster/tutor-invites", async (c) => {
  const auth = await requireInstitution(c);
  if (auth.error) return auth.error;
  try {
    const res = await getDb().execute({
      sql: `SELECT i.*, u.name AS claimed_name FROM tutor_invites i
            LEFT JOIN turso_records u ON u.id = i.claimed_user_id
            WHERE i.institution_id = ? ORDER BY i.created_at DESC`,
      args: [(auth.user as any).id],
    });
    return c.json({
      invites: (res.rows as any[]).map((r) => ({
        id: r.id, name: r.name, email: r.email,
        subjects: safeParseJsonArray(r.subjects),
        invite_code: r.invite_code, status: r.status,
        claimed_name: r.claimed_name || "", created_at: r.created_at, claimed_at: r.claimed_at || "",
        expires_at: r.expires_at || "", last_emailed_at: r.last_emailed_at || "",
        email_status: r.email_status || "unsent",
        invite_link: buildInviteLink(r.invite_code),
      })),
    });
  } catch (err: any) {
    return c.json({ error: "Failed to load tutor invites", details: err.message }, 500);
  }
});

function safeParseJsonArray(value: any): any[] {
  if (Array.isArray(value)) return value;
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}

// Add a tutor → generates their unique signup code.
institutionRoutes.post("/roster/tutor-invite", async (c) => {
  const auth = await requireInstitution(c);
  if (auth.error) return auth.error;
  const user = auth.user as any;
  try {
    const { name, email, subjects } = await c.req.json();
    const cleanName = typeof name === "string" ? name.trim() : "";
    const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    if (!cleanName || !cleanEmail) return c.json({ error: "Name and email required" }, 400);
    if (!EMAIL_REGEX.test(cleanEmail)) return c.json({ error: "Invalid email format." }, 400);
    const taken = await getDb().execute({ sql: "SELECT id FROM turso_records WHERE email = ?", args: [cleanEmail] });
    if (taken.rows.length > 0) return c.json({ error: "This email is already registered. Ask them to sign in instead." }, 409);
    const pending = await getDb().execute({ sql: "SELECT id FROM tutor_invites WHERE email = ? AND status = 'invited'", args: [cleanEmail] });
    if (pending.rows.length > 0) return c.json({ error: "This email already has a pending tutor invite code." }, 409);
    let code = "";
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = newTutorInviteCode();
      const clash = await getDb().execute({ sql: "SELECT id FROM tutor_invites WHERE invite_code = ?", args: [candidate] });
      if (clash.rows.length === 0) { code = candidate; break; }
    }
    if (!code) return c.json({ error: "Could not generate a code — try again." }, 500);
    const id = `tinv-${crypto.randomBytes(6).toString("hex")}`;
    const now = new Date().toISOString();
    const expiresAt = inviteExpiresAt();
    const subjectList = safeParseSubjects(subjects);
    await getDb().execute({
      sql: `INSERT INTO tutor_invites (id, institution_id, name, email, subjects, invite_code, status, created_at, expires_at)
            VALUES (?, ?, ?, ?, ?, ?, 'invited', ?, ?)`,
      args: [id, user.id, cleanName, cleanEmail, JSON.stringify(subjectList), code, now, expiresAt],
    });
    return c.json({ id, name: cleanName, email: cleanEmail, subjects: subjectList, invite_code: code, status: "invited", created_at: now, expires_at: expiresAt, invite_link: buildInviteLink(code) }, 201);
  } catch (err: any) {
    return c.json({ error: "Failed to invite tutor", details: err.message }, 500);
  }
});

// Email a pending tutor invite (code + click-to-join link).
institutionRoutes.post("/roster/tutor-invites/:id/send-email", async (c) => {
  const auth = await requireInstitution(c);
  if (auth.error) return auth.error;
  try {
    const own = await getDb().execute({
      sql: "SELECT * FROM tutor_invites WHERE id = ? AND institution_id = ?",
      args: [c.req.param("id"), (auth.user as any).id],
    });
    if (own.rows.length === 0) return c.json({ error: "Invite not found" }, 404);
    const inv = own.rows[0] as any;
    if (inv.status !== "invited") return c.json({ error: "This code was already claimed and cannot be emailed." }, 409);
    if (!isEmailConfigured()) {
      return c.json({ error: "Email not configured on the server (RESEND_API_KEY). Copy the link instead.", invite_link: buildInviteLink(inv.invite_code) }, 503);
    }
    const schoolName = String((auth.user as any).name || "Your school");
    const link = buildInviteLink(inv.invite_code);
    await sendInviteEmail({
      to: inv.email,
      studentName: inv.name || "Tutor",
      schoolName,
      code: inv.invite_code,
      link,
      gradeLevel: safeParseJsonArray(inv.subjects).join(", "),
      expiresAt: inv.expires_at || "",
      kind: "tutor",
    });
    const now = new Date().toISOString();
    await getDb().execute({
      sql: "UPDATE tutor_invites SET last_emailed_at = ?, email_status = 'sent' WHERE id = ?",
      args: [now, inv.id],
    });
    return c.json({ success: true, invite_link: link, emailed_at: now });
  } catch (err: any) {
    try {
      await getDb().execute({
        sql: "UPDATE tutor_invites SET email_status = 'failed' WHERE id = ?",
        args: [c.req.param("id")],
      });
    } catch { /* status update is best-effort */ }
    return c.json({ error: err.message || "Failed to send email" }, 500);
  }
});

// Revoke an unclaimed tutor invite.
institutionRoutes.delete("/roster/tutor-invites/:id", async (c) => {
  const auth = await requireInstitution(c);
  if (auth.error) return auth.error;
  try {
    const own = await getDb().execute({ sql: "SELECT * FROM tutor_invites WHERE id = ? AND institution_id = ?", args: [c.req.param("id"), (auth.user as any).id] });
    if (own.rows.length === 0) return c.json({ error: "Invite not found" }, 404);
    if ((own.rows[0] as any).status !== "invited") return c.json({ error: "This code was already claimed and cannot be revoked." }, 409);
    await getDb().execute({ sql: "DELETE FROM tutor_invites WHERE id = ?", args: [c.req.param("id")] });
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: "Failed to revoke invite", details: err.message }, 500);
  }
});

// Remove a tutor from this institution (tutor row + linked account + sessions).
institutionRoutes.delete("/roster/tutors/:id", async (c) => {
  const auth = await requireInstitution(c);
  if (auth.error) return auth.error;
  try {
    const target = await getDb().execute({ sql: "SELECT * FROM tutors WHERE id = ? AND institution_id = ?", args: [c.req.param("id"), (auth.user as any).id] });
    if (target.rows.length === 0) return c.json({ error: "Tutor not found" }, 404);
    const t = target.rows[0] as any;
    await getDb().execute({ sql: "DELETE FROM tutor_class_assignments WHERE tutor_id = ?", args: [t.id] });
    await getDb().execute({ sql: "DELETE FROM tutors WHERE id = ?", args: [t.id] });
    // Remove the linked login account, if the tutor ever claimed their code.
    if (t.email) {
      const acc = await getDb().execute({ sql: "SELECT id FROM turso_records WHERE email = ? AND type = 'Tutor'", args: [String(t.email).toLowerCase()] });
      for (const row of acc.rows as any[]) {
        await getDb().execute({ sql: "DELETE FROM class_enrollments WHERE student_id = ?", args: [row.id] });
        await getDb().execute({ sql: "DELETE FROM sessions WHERE userId = ?", args: [row.id] });
        await getDb().execute({ sql: "DELETE FROM turso_records WHERE id = ?", args: [row.id] });
      }
    }
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: "Failed to remove tutor", details: err.message }, 500);
  }
});

// ─── Students overview (Students screen) ───
// All tracks → grades → students in each grade, with per-student quiz
// completion and scores. One request powers the whole screen.
institutionRoutes.get("/roster/students-summary", async (c) => {
  const auth = await requireInstitution(c);
  if (auth.error) return auth.error;
  const instId = (auth.user as any).id;
  try {
    const link = (auth.user as any).affiliatedCode || instId;
    const [tracksRes, studentsRes] = await Promise.all([
      getDb().execute({ sql: "SELECT * FROM admin_tracks WHERE institution_id = ? ORDER BY created_at DESC", args: [instId] }),
      getDb().execute({
        sql: `SELECT tr.*, sp.points, sp.streakDays, sp.level, sp.lastActiveDate
              FROM turso_records tr LEFT JOIN student_progress sp ON sp.id = tr.id
              WHERE tr.affiliatedCode = ? AND tr.type != 'Institution' AND tr.type != 'Tutor'
              ORDER BY tr.name ASC`,
        args: [link],
      }),
    ]);
    const tracks = tracksRes.rows as any[];
    const students = studentsRes.rows as any[];
    const trackIds = tracks.map((t) => t.id);
    const gradesByTrack = new Map<string, any[]>();
    const coursesByTrack = new Map<string, any[]>();
    const classesByTrack = new Map<string, any[]>();
    if (trackIds.length > 0) {
      const ph = trackIds.map(() => "?").join(",");
      const [gradesRes, coursesRes, classesRes] = await Promise.all([
        getDb().execute({ sql: `SELECT * FROM admin_track_grades WHERE track_id IN (${ph}) ORDER BY sort_order ASC`, args: trackIds }),
        getDb().execute({ sql: `SELECT * FROM admin_courses WHERE track_id IN (${ph}) ORDER BY sort_order ASC`, args: trackIds }),
        getDb().execute({ sql: `SELECT * FROM admin_classes WHERE institution_id = ? ORDER BY created_at ASC`, args: [instId] }),
      ]);
      for (const g of gradesRes.rows as any[]) {
        const list = gradesByTrack.get(g.track_id) || [];
        list.push(g);
        gradesByTrack.set(g.track_id, list);
      }
      for (const co of coursesRes.rows as any[]) {
        const list = coursesByTrack.get(co.track_id) || [];
        list.push(co);
        coursesByTrack.set(co.track_id, list);
      }
      for (const cl of classesRes.rows as any[]) {
        const list = classesByTrack.get(cl.track_id) || [];
        let hasQuiz = false;
        try { hasQuiz = !!readLessonBody(cl.id).quizMarkdown.trim(); } catch { /* no quiz */ }
        list.push({ ...cl, has_quiz: hasQuiz });
        classesByTrack.set(cl.track_id, list);
      }
    }
    // Progress for all students × institution classes in bulk.
    const studentIds = students.map((s: any) => s.id);
    const progressByKey = new Map<string, any>();
    const enrolledByStudent = new Map<string, Set<string>>();
    if (studentIds.length > 0) {
      const sph = studentIds.map(() => "?").join(",");
      const [progRes, enrRes] = await Promise.all([
        getDb().execute({ sql: `SELECT * FROM class_progress WHERE student_id IN (${sph})`, args: studentIds }),
        getDb().execute({ sql: `SELECT class_id, student_id FROM class_enrollments WHERE student_id IN (${sph})`, args: studentIds }),
      ]);
      for (const p of progRes.rows as any[]) progressByKey.set(`${p.student_id}:${p.class_id}`, p);
      for (const e of enrRes.rows as any[]) {
        const set = enrolledByStudent.get(e.student_id) || new Set<string>();
        set.add(e.class_id);
        enrolledByStudent.set(e.student_id, set);
      }
    }
    const outTracks = tracks.map((t) => {
      const grades = gradesByTrack.get(t.id) || [];
      const courses = coursesByTrack.get(t.id) || [];
      const classes = classesByTrack.get(t.id) || [];
      const courseGrade = new Map<string, string>();
      for (const co of courses) courseGrade.set(co.id, co.grade_id || "");
      const gradeByLevel = new Map<string, string>();
      for (const g of grades) {
        if (!gradeByLevel.has(String(g.grade_level))) gradeByLevel.set(String(g.grade_level), g.id);
      }
      const classGrade = (cl: any): string => {
        if (cl.grade_id) return cl.grade_id;
        if (cl.course_id && courseGrade.get(cl.course_id)) return courseGrade.get(cl.course_id)!;
        if (cl.grade_level && cl.grade_level !== "all") return gradeByLevel.get(String(cl.grade_level)) || "";
        return "";
      };
      const gradeStudents = new Map<string, any[]>();
      const placed = new Set<string>();
      for (const g of grades) gradeStudents.set(g.id, []);
      const placeStudent = (gradeId: string, s: any) => {
        if (!gradeId || !gradeStudents.has(gradeId)) return false;
        const list = gradeStudents.get(gradeId)!;
        if (!list.some((x) => x.id === s.id)) list.push(s);
        placed.add(`${s.id}:${t.id}`);
        return true;
      };
      // Placement: enrolled in a grade's class, else matching account grade level.
      for (const s of students) {
        let done = false;
        const enrolled = enrolledByStudent.get(s.id);
        if (enrolled) {
          for (const cl of classes) {
            if (enrolled.has(cl.id)) {
              const gid = classGrade(cl);
              if (gid && placeStudent(gid, s)) done = true;
            }
          }
        }
        if (!done && s.gradeLevel) {
          const gid = gradeByLevel.get(String(s.gradeLevel));
          if (gid) placeStudent(gid, s);
        }
      }
      const studentView = (s: any, gradeClasses: any[]) => {
        const results = gradeClasses.map((cl) => {
          const p = progressByKey.get(`${s.id}:${cl.id}`);
          return {
            class_id: cl.id, class_title: cl.title, has_quiz: !!cl.has_quiz,
            score: p?.score ?? null, total: p?.total ?? (cl.has_quiz ? null : 0),
            status: p?.status || "not_started", completed_at: p?.completed_at || "",
          };
        });
        const quizzes = results.filter((r) => r.has_quiz);
        const doneQuizzes = quizzes.filter((r) => r.status === "completed");
        const pcts = quizzes.filter((r) => r.total > 0 && r.score !== null).map((r) => (r.score / r.total) * 100);
        return {
          id: s.id, name: s.name, email: s.email, grade_level: s.gradeLevel || "",
          points: s.points || 0, level: s.level || 1, last_active: s.lastActiveDate || "",
          quizzes_completed: doneQuizzes.length, quizzes_total: quizzes.length,
          avg_score: pcts.length > 0 ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null,
          classes: results,
        };
      };
      const gradeViews = grades.map((g) => {
        const gClasses = classes.filter((cl) => classGrade(cl) === g.id);
        const list = (gradeStudents.get(g.id) || []).map((s) => studentView(s, gClasses));
        const allPcts = list.flatMap((s: any) => s.classes.filter((r: any) => r.total > 0 && r.score !== null).map((r: any) => (r.score / r.total) * 100));
        return {
          id: g.id, grade_level: g.grade_level, label: g.label || `Grade ${g.grade_level}`,
          class_count: gClasses.length, student_count: list.length,
          avg_score: allPcts.length > 0 ? Math.round(allPcts.reduce((a, b) => a + b, 0) / allPcts.length) : null,
          students: list,
        };
      });
      // Students with no placement in this track.
      const ungraded = students
        .filter((s) => !placed.has(`${s.id}:${t.id}`))
        .map((s) => studentView(s, []));
      return { id: t.id, name: t.name, description: t.description || "", subject: t.subject || "General", grades: gradeViews, ungraded };
    });
    return c.json({ tracks: outTracks });
  } catch (err: any) {
    return c.json({ error: "Failed to load students summary", details: err.message }, 500);
  }
});

// Remove an enrolled student from this institution (account + enrollments + sessions).
institutionRoutes.delete("/roster/students/:id", async (c) => {
  const auth = await requireInstitution(c);
  if (auth.error) return auth.error;
  const user = auth.user as any;
  try {
    const target = await getDb().execute({ sql: "SELECT * FROM turso_records WHERE id = ?", args: [c.req.param("id")] });
    if (target.rows.length === 0) return c.json({ error: "Student not found" }, 404);
    const t = target.rows[0] as any;
    const link = user.affiliatedCode || user.id;
    if (t.type === "Institution" || t.affiliatedCode !== link) return c.json({ error: "Student not found" }, 404);
    await getDb().execute({ sql: "DELETE FROM class_enrollments WHERE student_id = ?", args: [t.id] });
    await getDb().execute({ sql: "DELETE FROM sessions WHERE userId = ?", args: [t.id] });
    await getDb().execute({ sql: "DELETE FROM turso_records WHERE id = ?", args: [t.id] });
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: "Failed to remove student", details: err.message }, 500);
  }
});

institutionRoutes.get("/tutors", async (c) => {
  const token = getSessionToken(c);
  const session = await validateSession(token);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  try {
    const userRes = await getDb().execute({ sql: "SELECT * FROM turso_records WHERE id = ?", args: [session.userId] });
    const user = userRes.rows[0] as any;
    const instId = user.type === "Institution" ? user.id : user.affiliatedCode;
    const tutorsRes = await getDb().execute({ sql: "SELECT * FROM tutors WHERE institution_id = ?", args: [instId] });
    return c.json({ tutors: tutorsRes.rows });
  } catch (err: any) {
    return c.json({ error: "Failed to load tutors", details: err.message }, 500);
  }
});

institutionRoutes.post("/tutors", async (c) => {
  const token = getSessionToken(c);
  const session = await validateSession(token);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  try {
    const userRes = await getDb().execute({ sql: "SELECT * FROM turso_records WHERE id = ?", args: [session.userId] });
    const user = userRes.rows[0] as any;
    const instId = user.type === "Institution" ? user.id : user.affiliatedCode;
    const { name, email, subjects, grade_levels } = await c.req.json();
    if (!name || !email) return c.json({ error: "Name and email required" }, 400);
    const tutorId = `tutor-${Date.now()}`;
    await getDb().execute({
      sql: `INSERT INTO tutors (id, institution_id, name, email, subjects, grade_levels, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [tutorId, instId, name, email, JSON.stringify(subjects || []), JSON.stringify(grade_levels || []), new Date().toISOString()],
    });
    return c.json({ id: tutorId, name, email, subjects, grade_levels }, 201);
  } catch (err: any) {
    return c.json({ error: "Failed to create tutor", details: err.message }, 500);
  }
});

institutionRoutes.post("/tutors/assign", async (c) => {
  const token = getSessionToken(c);
  const session = await validateSession(token);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  try {
    const { tutor_id, student_id } = await c.req.json();
    if (!tutor_id || !student_id) return c.json({ error: "tutor_id and student_id required" }, 400);
    await getDb().execute({ sql: "UPDATE turso_records SET assignedTutorId = ? WHERE id = ?", args: [tutor_id, student_id] });
    const tutorRes = await getDb().execute({ sql: "SELECT * FROM tutors WHERE id = ?", args: [tutor_id] });
    const tutor = tutorRes.rows[0] as any;
    return c.json({ success: true, tutor: { id: tutor.id, name: tutor.name, email: tutor.email } });
  } catch (err: any) {
    return c.json({ error: "Failed to assign tutor", details: err.message }, 500);
  }
});

institutionRoutes.put("/curriculum/override", async (c) => {
  const token = getSessionToken(c);
  const session = await validateSession(token);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  try {
    const userRes = await getDb().execute({ sql: "SELECT * FROM turso_records WHERE id = ?", args: [session.userId] });
    const user = userRes.rows[0] as any;
    const instId = user.type === "Institution" ? user.id : user.affiliatedCode;
    const { grade_level, subject, ordered_lesson_ids } = await c.req.json();
    if (!grade_level || !subject || !ordered_lesson_ids) return c.json({ error: "grade_level, subject, and ordered_lesson_ids required" }, 400);
    const overrideId = `override-${instId}-${grade_level}-${subject}`;
    const now = new Date().toISOString();
    await getDb().execute({
      sql: `INSERT INTO institution_curriculum_overrides (id, institution_id, grade_level, subject, ordered_lesson_ids, created_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET ordered_lesson_ids = excluded.ordered_lesson_ids, updated_at = excluded.updated_at`,
      args: [overrideId, instId, grade_level, subject, JSON.stringify(ordered_lesson_ids), session.userId, now],
    });
    return c.json({ success: true, override_id: overrideId });
  } catch (err: any) {
    return c.json({ error: "Failed to set curriculum override", details: err.message }, 500);
  }
});
