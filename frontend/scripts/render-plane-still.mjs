// Renders the airliner scene once (still pose) in headless Chromium with SwiftShader and writes
// src/assets/plane-still.webp, the image PlaneHero shows while loading, under reduced motion and
// without WebGL. Run with `pnpm render:plane` and commit the result.
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const output = fileURLToPath(new URL("../src/assets/plane-still.webp", import.meta.url));

const server = await createServer({
  root,
  configFile: fileURLToPath(new URL("../vite.config.ts", import.meta.url)),
  logLevel: "warn",
  server: { host: "127.0.0.1", port: 5179, strictPort: false, hmr: false },
});

let browser;
try {
  await server.listen();
  const base = server.resolvedUrls?.local[0];
  if (!base) throw new Error("Vite dev server did not report a local URL");

  browser = await chromium.launch({
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
  });
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  page.on("pageerror", (error) => console.error(`page error: ${error.message}`));
  await page.goto(new URL("scripts/plane-still.html", base).href);
  await page.waitForFunction(() => document.body.dataset.state !== "loading", null, {
    timeout: 60_000,
  });

  const state = await page.evaluate(() => document.body.dataset.state);
  if (state !== "ready") {
    const reason = await page.evaluate(() => document.body.dataset.error ?? "unknown");
    throw new Error(`The scene did not render: ${reason}`);
  }

  const dataUrl = await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    return canvas ? canvas.toDataURL("image/webp", 0.86) : "";
  });
  const prefix = "data:image/webp;base64,";
  if (!dataUrl.startsWith(prefix)) throw new Error("The canvas did not export a WebP image");

  const bytes = Buffer.from(dataUrl.slice(prefix.length), "base64");
  await writeFile(output, bytes);
  console.log(`Wrote ${output} (${bytes.length} bytes)`);
} finally {
  await browser?.close();
  await server.close();
}
