import { watch } from "fs";
import { join } from "path";

const SRC = join(import.meta.dir, "src");

console.log("🔥 Starting dev server with hot reload...");

// Initial build
await import("./build.ts");

// Watch src/ for changes and rebuild frontend
let buildTimeout: ReturnType<typeof setTimeout> | null = null;

watch(SRC, { recursive: true }, (event, filename) => {
  if (!filename || !filename.endsWith(".svelte") && !filename.endsWith(".ts") && !filename.endsWith(".css")) return;

  if (buildTimeout) clearTimeout(buildTimeout);
  buildTimeout = setTimeout(async () => {
    console.log(`\n🔄 Rebuilding... (${filename})`);
    try {
      // Rebuild frontend + Tailwind CSS (new utility classes in edited
      // components must be regenerated — otherwise new screens look unstyled)
      const { SveltePlugin } = await import("bun-plugin-svelte");
      const { rmSync, mkdirSync, cpSync, existsSync } = await import("fs");

      const DIST = join(import.meta.dir, "dist");
      await Bun.$`bun x @tailwindcss/cli -i src/index.css -o ${DIST}/tailwind.css`;
      const frontendResult = await Bun.build({
        entrypoints: [join(import.meta.dir, "src", "index.ts")],
        outdir: DIST,
        naming: { entry: "index.js" },
        target: "browser",
        minify: false,
        sourcemap: "external",
        plugins: [SveltePlugin({ development: true })],
      });

      if (frontendResult.success) {
        console.log(`✅ Frontend rebuilt (${filename})`);
      } else {
        console.error("❌ Frontend build failed:");
        frontendResult.logs.forEach(l => console.error(l));
      }
    } catch (err) {
      console.error("❌ Rebuild error:", err);
    }
  }, 300);
});

// Start server with --hot for server-side HMR
console.log("🚀 Starting server on http://localhost:3000...");
const server = Bun.spawn(["bun", "--hot", "run", "server.ts"], {
  stdio: ["inherit", "inherit", "inherit"],
  cwd: import.meta.dir,
});

// Graceful shutdown
process.on("SIGINT", () => {
  server.kill();
  process.exit(0);
});

process.on("SIGTERM", () => {
  server.kill();
  process.exit(0);
});

await server.exited;
