// Server entry point — delegates to server/index.ts where the Hono app,
// route modules, and static/SPA middleware are assembled.
import { app } from "./server/index";
import { serve } from "@hono/node-server";
import { initDB } from "./server/db";

const PORT = Number(process.env.PORT || 3000);

// ─── Start ───
await initDB();
console.log(`🚀 Starting server on port ${PORT}...`);
serve({ fetch: app.fetch, port: PORT });
