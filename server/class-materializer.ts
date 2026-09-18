import fs from "fs";
import path from "path";

// ─── Paths ───
const ROOT = process.cwd();
export const GAMES_DIR = path.join(ROOT, "public", "games");

export function ensureDirs() {
  fs.mkdirSync(GAMES_DIR, { recursive: true });
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "class";
}

export function sanitizeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\son[a-z]+\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
}

// NOTE: lessons used to be compiled to generated .svelte components
// (src/curriculum/classes/* + registry). That required a rebuild on every
// create/update, so it was retired: lessons are stored as JSON + HTML/Markdown
// under content/lessons/<id>/ and rendered at runtime by LessonPlayer.

export async function saveUploadedGame(file: File): Promise<{ filename: string; url: string; size: number; needsExtract: boolean }> {
  const name = file.name || "game.zip";
  const isZip = /\.zip$/i.test(name);
  const isHtml = /\.html?$/i.test(name);
  if (!isZip && !isHtml) {
    throw new Error("Upload a .zip containing your game (with an index.html) or a single .html file");
  }
  if (file.size > 20 * 1024 * 1024) {
    throw new Error("File exceeds the 20 MB limit");
  }
  ensureDirs();
  const stamp = Date.now();
  const safeBase = slugify(name.replace(/\.(zip|html?)$/i, ""));
  const stored = `${safeBase}-${stamp}${isZip ? ".zip" : ".html"}`;
  const dest = path.join(GAMES_DIR, stored);
  const buf = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(dest, buf);
  return { filename: stored, url: `/games/${stored}`, size: file.size, needsExtract: isZip };
}
