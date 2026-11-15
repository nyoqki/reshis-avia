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
    // vitest stubs CSS imports (even ?raw) to "" unless included; tokens.test.ts reads index.css?raw
    css: { include: [/index\.css/, /board\.css/] },
    environment: "jsdom",
    setupFiles: ["src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
