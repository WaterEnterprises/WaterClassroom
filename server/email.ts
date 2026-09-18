// ─── Outbound email (Resend over HTTPS — no native deps, Bun-friendly) ───
// Env: RESEND_API_KEY (required), INVITE_FROM_EMAIL, APP_URL.

export function isEmailConfigured(): boolean {
  return !!String(process.env.RESEND_API_KEY || "").trim();
}

export function getInviteFromEmail(): string {
  return String(process.env.INVITE_FROM_EMAIL || "Water Classroom <noreply@waterclassroom.app>");
}

function escapeHtml(s: string): string {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendInviteEmail(args: {
  to: string;
  studentName: string;
  schoolName: string;
  code: string;
  link: string;
  gradeLevel: string;
  expiresAt: string;
  kind?: "student" | "tutor";
}): Promise<{ id: string }> {
  const kind = args.kind || "student";
  const isTutor = kind === "tutor";
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  if (!apiKey) throw new Error("Email not configured — set RESEND_API_KEY.");
  const expiryNote = args.expiresAt
    ? `This code expires on ${new Date(args.expiresAt).toLocaleDateString()}.`
    : "";
  const subject = isTutor
    ? `You're invited as a tutor at ${args.schoolName} on Water Classroom`
    : `You're invited to join ${args.schoolName} on Water Classroom`;
  const roleLine = isTutor
    ? `${args.schoolName} invited you to join Water Classroom as a tutor${args.gradeLevel ? ` (${args.gradeLevel})` : ""}.\n\nTutors get full learning resources plus their assigned classes, students, and forum moderation tools.\n\n`
    : `${args.schoolName} invited you to join Water Classroom (Grade ${args.gradeLevel}).\n\n`;
  const text =
    `Hi ${args.studentName},\n\n` +
    roleLine +
    `Your personal signup code: ${args.code}\n` +
    `Sign up here: ${args.link}\n\n` +
    `The code is locked to this email address (${args.to}) — sign up with it. ` +
    `Your account is free and billed to your school. ${expiryNote}\n\n` +
    `— The Water Classroom team`;
  const html =
    `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#0f172a">` +
    `<h2 style="margin:0 0 8px">You're invited to Water Classroom 🌊</h2>` +
    `<p style="margin:0 0 12px"><strong>${escapeHtml(args.schoolName)}</strong> invited ` +
    `<strong>${escapeHtml(args.studentName)}</strong>${isTutor ? " as a <strong>tutor</strong>" : ` (Grade ${escapeHtml(args.gradeLevel)})`} to join.</p>` +
    `<p style="margin:0 0 6px">Your personal signup code:</p>` +
    `<p style="font-size:24px;font-weight:800;letter-spacing:4px;margin:0 0 12px">${escapeHtml(args.code)}</p>` +
    `<p style="margin:0 0 16px"><a href="${escapeHtml(args.link)}" ` +
    `style="display:inline-block;background:#059669;color:#fff;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:700">` +
    `Sign up now</a></p>` +
    `<p style="font-size:12px;color:#64748b">Or paste the code into the “School / Invite Code” field at registration. ` +
    `The code only works with ${escapeHtml(args.to)}. ` +
    `${escapeHtml(expiryNote)}</p></div>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: getInviteFromEmail(), to: [args.to], subject, html, text }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as any)?.message || (data as any)?.error || `Email send failed (${res.status})`);
  }
  return { id: String((data as any)?.id || "") };
}
