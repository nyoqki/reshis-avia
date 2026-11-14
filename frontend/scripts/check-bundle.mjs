// Entry-chunk budget for the production build. Reads dist/index.html, measures the entry module and
// checks that three.js stays out of its static import closure (the entry plus its modulepreload
// links) and lives in a lazy chunk instead. Exit 1 with a readable message on any failure.
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const RAW_MAX = 423244;
const GZIP_MAX = 136542;
// three's renderer warnings and its scene-graph property name survive minification
// (verified in three 0.187.0 build/three.module.js and build/three.core.js).
const MARKERS = ["WebGLRenderer", "isObject3D"];

const dist = fileURLToPath(new URL("../dist/", import.meta.url));
const assetsDir = new URL("../dist/assets/", import.meta.url);

/** Value of the attribute `attr` on one HTML tag, or null. */
function attrOf(tag, attr) {
  const match = tag.match(new RegExp(`\\s${attr}\\s*=\\s*["']([^"']+)["']`, "i"));
  return match ? match[1] : null;
}

function assetName(ref) {
  const match = ref?.match(/^\/assets\/([^/?#]+)$/);
  return match ? match[1] : null;
}

const errors = [];
let html;
try {
  html = await readFile(`${dist}index.html`, "utf8");
} catch {
  console.error("check-bundle: dist/index.html not found; run vite build first.");
  process.exit(1);
}

let entry = null;
for (const tag of html.match(/<script\b[^>]*>/gi) ?? []) {
  if (attrOf(tag, "type") !== "module") continue;
  const name = assetName(attrOf(tag, "src"));
  if (name) {
    entry = name;
    break;
  }
}
if (!entry) {
  console.error("check-bundle: no entry module script under /assets/ in dist/index.html.");
  process.exit(1);
}

const closure = [entry];
for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
  if (attrOf(tag, "rel") !== "modulepreload") continue;
  const name = assetName(attrOf(tag, "href"));
  if (name && !closure.includes(name)) closure.push(name);
}

const read = (name) => readFile(new URL(name, assetsDir));
const entryBytes = await read(entry);
const raw = entryBytes.length;
const gzip = gzipSync(entryBytes, { level: 9 }).length;
console.log(
  `check-bundle: entry ${entry}: ${raw} B raw (max ${RAW_MAX}), ${gzip} B gzip -9 (max ${GZIP_MAX})`,
);
if (raw > RAW_MAX) errors.push(`entry ${entry} is ${raw} B raw, over the ${RAW_MAX} B budget`);
if (gzip > GZIP_MAX)
  errors.push(`entry ${entry} is ${gzip} B gzipped, over the ${GZIP_MAX} B budget`);

for (const name of closure) {
  const text = (await read(name)).toString("utf8");
  const found = MARKERS.filter((marker) => text.includes(marker));
  if (found.length > 0) {
    errors.push(
      `${name} is in the entry's static closure and contains three.js (${found.join(", ")})`,
    );
  }
}

const lazy = [];
for (const name of await readdir(assetsDir)) {
  if (!name.endsWith(".js") || closure.includes(name)) continue;
  const text = (await read(name)).toString("utf8");
  if (MARKERS.every((marker) => text.includes(marker))) lazy.push(name);
}
if (lazy.length > 0) console.log(`check-bundle: three.js lives in ${lazy.join(", ")}`);
else errors.push("no lazy chunk in dist/assets contains three.js; is PlaneHero mounted?");

if (errors.length > 0) {
  for (const error of errors) console.error(`check-bundle: ${error}`);
  process.exit(1);
}
console.log(`check-bundle: ok (static closure: ${closure.join(", ")})`);
