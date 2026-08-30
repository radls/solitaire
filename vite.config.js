import { defineConfig } from "vite";

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
  test: {
    environment: "node",
    include: ["test/**/*.test.js"],
  },
});
