import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: { "/api": "http://127.0.0.1:8000" },
    // tests read ../data/*.csv with ?raw; allow only that folder, not the repo root (var/ holds the
    // SQLite database). Paths resolve against this folder.
    fs: { allow: [".", "../data"] },
  },
  test: {
    // vitest stubs CSS imports (even ?raw) to "" unless included. Every stylesheet in src is included
    // so the tests that read CSS (tokens, flap, hatch, and the design-system scan over all of src)
    // see the real rules.
    css: { include: [/\/src\/[^?]*\.css/] },
    environment: "jsdom",
    setupFiles: ["src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
