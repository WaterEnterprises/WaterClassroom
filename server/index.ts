import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import fs from "fs";
import path from "path";

import { authRoutes } from "./routes/auth";
import { curriculumRoutes } from "./routes/curriculum";
import { lessonRoutes } from "./routes/lessons";
import { examRoutes } from "./routes/exams";
import { communityRoutes } from "./routes/community";
import { institutionRoutes } from "./routes/institution";
import { userRoutes } from "./routes/users";
import { progressRoutes } from "./routes/progress";
import { taskRoutes } from "./routes/tasks";
import { paymentRoutes } from "./routes/payments";
import { adminStudioRoutes } from "./routes/admin-studio";
import { institutionCurriculumRoutes } from "./routes/institution-curriculum";
import { tutorRoutes } from "./routes/tutor";
import { messageRoutes } from "./routes/messages";
import { aiRoutes } from "./routes/ai";

export const app = new Hono();

// ─── API Routes ───
// Mounted at /api root to preserve the original endpoint paths used by the frontend:
// /api/register, /api/login, /api/logout, /api/session, /api/records,
// /api/update-user, /api/activate-user, /api/create-checkout-session, /api/gemini/tutoring
app.route("/api", authRoutes);
app.route("/api", userRoutes);
app.route("/api", paymentRoutes);
app.route("/api", aiRoutes);
app.route("/api/curriculum", curriculumRoutes);
app.route("/api/lessons", lessonRoutes);
app.route("/api/exam", examRoutes);
app.route("/api/community", communityRoutes);
app.route("/api/institution", institutionRoutes);
// Institution's own curriculum: classes with join codes, enrolled students,
// student signup code. Any institution (no system permission needed).
app.route("/api/institution/curriculum", institutionCurriculumRoutes);
app.route("/api/progress", progressRoutes);
app.route("/api/tasks", taskRoutes);
app.route("/api/tutor", tutorRoutes);
app.route("/api/messages", messageRoutes);
// Class Studio: admin track/class authoring, game uploads, and the public
// endpoints used by onboarding (/api/studio/available-tracks, /available-classes,
// /select-track, /my-track)
app.route("/api/studio", adminStudioRoutes);

// ─── SPA fallback ───
app.get("*", async (c, next) => {
  const p = c.req.path;
  if (p.startsWith("/api") || p.includes(".")) return next();
  try {
    const html = fs.readFileSync(path.join(process.cwd(), "dist", "index.html"), "utf-8");
    return c.html(html);
  } catch {
    return c.text("Building... please refresh.", 503);
  }
});

// Serve freshly uploaded games from the source public dir too
// (dist only gets them after the next build).
app.use("/games/*", serveStatic({ root: "./public" }));
app.use("/*", serveStatic({ root: "./dist" }));
