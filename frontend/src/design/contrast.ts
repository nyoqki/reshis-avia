export type Rgb = [number, number, number];

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

function encode(c: number): number {
  const v = clamp01(c);
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
}

function oklchToSrgb(L: number, C: number, hDeg: number): Rgb {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return [encode(r), encode(g), encode(bl)];
}

/** Parses oklch(L C H) and #hex into gamma-encoded sRGB in 0..1, clamped to the gamut. */
export function parseColor(value: string): Rgb {
  const v = value.trim();
  const ok = v.match(/^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?\s*(?:\/[^)]*)?\)$/i);
  if (ok) {
    const L = Number(ok[1]) / (ok[2] ? 100 : 1);
    return oklchToSrgb(L, Number(ok[3]), Number(ok[4]));
  }
  const hex = v.match(/^#([\da-f]{3}|[\da-f]{6})$/i);
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join("") : hex[1];
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as Rgb;
  }
  throw new Error(`unsupported colour: ${value}`);
}

function wcagLuminance([r, g, b]: Rgb): number {
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function wcagRatio(fg: string, bg: string): number {
  const a = wcagLuminance(parseColor(fg));
  const b = wcagLuminance(parseColor(bg));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function apcaY([r, g, b]: Rgb): number {
  const y = 0.2126729 * r ** 2.4 + 0.7151522 * g ** 2.4 + 0.072175 * b ** 2.4;
  return y < 0.022 ? y + (0.022 - y) ** 1.414 : y;
}

/** APCA 0.0.98G-4g lightness contrast, signed (negative for light text on a dark background). */
export function apcaLc(text: string, bg: string): number {
  const yt = apcaY(parseColor(text));
  const yb = apcaY(parseColor(bg));
  if (Math.abs(yb - yt) < 0.0005) return 0;
  if (yb > yt) {
    const s = (yb ** 0.56 - yt ** 0.57) * 1.14;
    return (s < 0.1 ? 0 : s - 0.027) * 100;
  }
  const s = (yb ** 0.65 - yt ** 0.62) * 1.14;
  return (s > -0.1 ? 0 : s + 0.027) * 100;
}

/** Returns the body of the first brace block opened at or after `from` (nested braces matched). */
function blockAt(css: string, from: number): { body: string; end: number } | null {
  const open = css.indexOf("{", from);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) return { body: css.slice(open + 1, i), end: i + 1 };
  }
  return null;
}

function colorDecls(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/(--color-[\w-]+)\s*:\s*([^;]+);/g)) {
    const value = m[2].trim();
    if (!value.startsWith("var(")) out[m[1]] = value;
  }
  return out;
}

/** Light = --color-* of the `@theme static` block; dark = light overridden by every `:root[data-theme="dark"]` block. */
export function readThemeColors(css: string, scheme: "light" | "dark"): Record<string, string> {
  const start = css.search(/@theme\s+static\s*\{/);
  const theme = start < 0 ? null : blockAt(css, start);
  const colors = theme ? colorDecls(theme.body) : {};
  if (scheme === "light") return colors;
  for (const m of css.matchAll(/:root\[data-theme="dark"\]\s*\{/g)) {
    const block = blockAt(css, m.index);
    if (block) Object.assign(colors, colorDecls(block.body));
  }
  return colors;
}
