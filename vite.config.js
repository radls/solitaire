import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = dirname(fileURLToPath(import.meta.url));

function appVersion() {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  return pkg.version;
}

/** 7-character SHA of the commit being built. Actions sets GITHUB_SHA; local builds use git. */
function shortSha() {
  const env = (process.env.GITHUB_SHA || "").trim();
  if (/^[0-9a-f]{7,40}$/i.test(env)) return env.slice(0, 7).toLowerCase();
  try {
    const full = execSync("git rev-parse HEAD", { encoding: "utf8", cwd: root }).trim();
    if (/^[0-9a-f]{7,40}$/i.test(full)) return full.slice(0, 7).toLowerCase();
  } catch {
    // Fall through to the error below.
  }
  throw new Error("Set GITHUB_SHA or run from a git checkout so the menu can show the build commit.");
}

export default defineConfig({
  // GitHub Pages serves this repo at /solitaire/. Local dev stays at /.
  base: process.env.GITHUB_PAGES === "true" ? "/solitaire/" : "/",
  server: {
    host: "127.0.0.1",
    port: 5180,
    strictPort: true,
  },
  preview: {
    host: "127.0.0.1",
    port: 5180,
    strictPort: true,
  },
  // Keep the pre-Vite-7 browser targets so older iOS Safari keeps working.
  build: {
    target: ["es2020", "edge88", "firefox78", "chrome87", "safari14"],
  },
  define: {
    __APP_VERSION__: JSON.stringify(appVersion()),
    __APP_SHA__: JSON.stringify(shortSha()),
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.js"],
  },
});
