import { SveltePlugin } from "bun-plugin-svelte";
import { rmSync, existsSync, cpSync, mkdirSync } from "fs";
import { join } from "path";

const DIST = join(import.meta.dir, "dist");

if (existsSync(DIST)) {
  rmSync(DIST, { recursive: true, force: true });
}
mkdirSync(DIST, { recursive: true });

// 1. Build Tailwind CSS
// NOTE: must NOT output to dist/index.css — Bun.build writes the Svelte
// components' extracted <style> blocks to dist/index.css (same basename as
// the index.js bundle) and would overwrite the Tailwind file.
console.log("📦 Building Tailwind CSS...");
await Bun.$`bun x @tailwindcss/cli -i src/index.css -o ${DIST}/tailwind.css --minify`;

// 2. Bundle Svelte frontend using bun-plugin-svelte
console.log("📦 Bundling Svelte frontend...");
const frontendResult = await Bun.build({
  entrypoints: [join(import.meta.dir, "src", "index.ts")],
  outdir: DIST,
  target: "browser",
  minify: false,
  sourcemap: "external",
  plugins: [
    SveltePlugin({
      development: true,
    }),
  ],
});
if (frontendResult.success) {
  console.log(`  Bundled ${frontendResult.outputs.length} outputs:`);
  frontendResult.outputs.forEach(o => console.log(`    ${o.path}`));
} else {
  console.error("❌ Frontend bundle failed:");
  frontendResult.logs.forEach(l => console.error(l));
  process.exit(1);
}

// 3. Bundle server
console.log("📦 Bundling server...");
const serverResult = await Bun.build({
  entrypoints: [join(import.meta.dir, "server.ts")],
  outdir: DIST,
  naming: "[name].[ext]",
  target: "bun",
  minify: true,
  sourcemap: "external",
  packages: "external",
});
if (serverResult.success) {
  console.log(`  Bundled ${serverResult.outputs.length} outputs`);
} else {
  console.error("❌ Server bundle failed:");
  serverResult.logs.forEach(l => console.error(l));
  process.exit(1);
}

// 4. Copy static files
console.log("📁 Copying static assets...");
cpSync(join(import.meta.dir, "index.html"), join(DIST, "index.html"));
if (existsSync(join(import.meta.dir, "public"))) {
  cpSync(join(import.meta.dir, "public"), DIST, { recursive: true });
}

console.log("✅ Build complete!");
