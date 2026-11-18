import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { resolveBuildSha } from "./scripts/resolve-build-sha.js";

const root = dirname(fileURLToPath(import.meta.url));

function appVersion() {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  return pkg.version;
}

function gitExec(args) {
  return execFileSync(args[0], args.slice(1), { encoding: "utf8" });
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
    __APP_SHA__: JSON.stringify(resolveBuildSha({
      env: process.env,
      root,
      exec: gitExec,
      realpath: realpathSync,
    })),
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.js"],
  },
});
