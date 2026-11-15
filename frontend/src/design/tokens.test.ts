import { describe, expect, it } from "vitest";
import css from "../index.css?raw";
import { apcaLc, parseColor, readThemeColors, wcagRatio } from "./contrast";

const LIGHT_TOKENS: Record<string, string> = {
  paper: "oklch(0.972 0.005 90)",
  "paper-raised": "oklch(0.995 0.002 90)",
  "paper-sunken": "oklch(0.938 0.006 90)",
  ink: "oklch(0.22 0.01 260)",
  "ink-2": "oklch(0.46 0.012 260)",
  line: "oklch(0.885 0.006 90)",
  "line-strong": "oklch(0.6 0.01 260)",
  sign: "oklch(0.87 0.17 92)",
  "sign-hover": "oklch(0.83 0.165 88)",
  "sign-ink": "oklch(0.22 0.01 260)",
  "sign-edge": "oklch(0.6 0.13 85)",
  board: "oklch(0.18 0.01 260)",
  "board-edge": "oklch(0.18 0.01 260)",
  "board-line": "oklch(0.34 0.01 260)",
  "board-ink": "oklch(0.95 0.012 90)",
  "board-ink-2": "oklch(0.8 0.01 260)",
  flap: "oklch(0.255 0.01 260)",
  "flap-hi": "oklch(0.285 0.01 260)",
  bar: "oklch(0.56 0.012 260)",
  danger: "oklch(0.5 0.17 27)",
  warning: "oklch(0.5 0.11 65)",
  success: "oklch(0.5 0.12 150)",
  "board-danger": "oklch(0.83 0.085 25)",
  "board-warning": "oklch(0.84 0.11 70)",
  focus: "oklch(0.22 0.01 260)",
  "board-focus": "oklch(0.87 0.17 92)",
};

const DARK_OVERRIDES: Record<string, string> = {
  paper: "oklch(0.205 0.01 260)",
  "paper-raised": "oklch(0.25 0.01 260)",
  "paper-sunken": "oklch(0.175 0.01 260)",
  ink: "oklch(0.945 0.01 90)",
  "ink-2": "oklch(0.8 0.01 260)",
  line: "oklch(0.31 0.01 260)",
  "line-strong": "oklch(0.55 0.01 260)",
  "sign-hover": "oklch(0.91 0.14 95)",
  "sign-edge": "oklch(0.87 0.17 92)",
  board: "oklch(0.155 0.01 260)",
  "board-edge": "oklch(0.34 0.01 260)",
  "board-line": "oklch(0.31 0.01 260)",
  flap: "oklch(0.245 0.01 260)",
  "flap-hi": "oklch(0.275 0.01 260)",
  danger: "oklch(0.83 0.085 25)",
  warning: "oklch(0.84 0.11 70)",
  success: "oklch(0.82 0.12 150)",
  focus: "oklch(0.87 0.17 92)",
};

const TEXT_PAIRS: Array<[string, string]> = [
  ["ink", "paper"],
  ["ink", "paper-raised"],
  ["ink", "paper-sunken"],
  ["ink-2", "paper"],
  ["ink-2", "paper-raised"],
  ["ink-2", "paper-sunken"],
  ["sign-ink", "sign"],
  ["board-ink", "board"],
  ["board-ink", "flap"],
  ["board-ink-2", "board"],
  ["board-ink-2", "flap"],
  ["sign", "board"],
  ["danger", "paper"],
  ["warning", "paper"],
  ["success", "paper"],
  ["board-danger", "board"],
  ["board-warning", "board"],
  // hover fills: primary and board buttons, error and warning text inside the white form card
  ["sign-ink", "sign-hover"],
  ["board-ink", "flap-hi"],
  ["danger", "paper-raised"],
  ["warning", "paper-raised"],
  // pressed (active) fills of buttons, tabs and segments; the primary button presses to sign-active
  ["sign-ink", "sign-active"],
  ["ink", "line"],
  ["ink-2", "line"],
  ["board-ink", "board-line"],
];

const NON_TEXT_PAIRS: Array<[string, string]> = [
  ["line-strong", "paper-raised"],
  ["bar", "board"],
  ["sign", "board"],
  ["focus", "paper"],
  ["board-focus", "board"],
  ["board-focus", "flap"],
  ["sign-edge", "paper"],
  // the dashed seats line of the chart
  ["board-ink", "board"],
  // the «?» icon of a pressed hint button on the board
  ["board-ink-2", "board-line"],
];

function braceBlock(source: string, start: number): string {
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}" && --depth === 0) return source.slice(open + 1, i);
  }
  throw new Error("unbalanced braces");
}

function colorDecls(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/(--color-[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

describe("contrast.ts reference values", () => {
  it("TB-AC3: reproduces WCAG and APCA reference values", () => {
    const a = {
      fg: "oklch(0.46 0.012 260)",
      bg: "oklch(0.972 0.005 90)",
    };
    expect(Math.abs(wcagRatio(a.fg, a.bg) - 6.57)).toBeLessThanOrEqual(0.03);
    expect(Math.abs(apcaLc(a.fg, a.bg) - 79.1)).toBeLessThanOrEqual(0.5);
    const b = {
      fg: "oklch(0.8 0.01 260)",
      bg: "oklch(0.18 0.01 260)",
    };
    expect(Math.abs(wcagRatio(b.fg, b.bg) - 10.07)).toBeLessThanOrEqual(0.03);
    expect(Math.abs(apcaLc(b.fg, b.bg) + 66.7)).toBeLessThanOrEqual(0.5);
  });

  it("TB-AC3: parseColor handles hex and returns gamma-encoded sRGB in 0..1", () => {
    const [r, g, b] = parseColor("#ffffff");
    expect([r, g, b].every((c) => Math.abs(c - 1) < 0.005)).toBe(true);
    const out = parseColor("oklch(0.5 0.4 30)");
    expect(out.every((c) => c >= 0 && c <= 1)).toBe(true);
  });
});

describe("theme colours", () => {
  const light = readThemeColors(css, "light");
  const dark = readThemeColors(css, "dark");

  it("TB-AC2: every token listed in the plan exists in @theme with its value", () => {
    for (const [name, value] of Object.entries(LIGHT_TOKENS)) {
      expect(light[`--color-${name}`], name).toBe(value);
    }
  });

  it("TB-AC2: dark overrides carry the planned values and others fall through to light", () => {
    for (const [name, value] of Object.entries(DARK_OVERRIDES)) {
      expect(dark[`--color-${name}`], name).toBe(value);
    }
    for (const name of ["sign", "sign-ink", "bar", "board-ink", "board-focus"]) {
      expect(dark[`--color-${name}`], name).toBe(LIGHT_TOKENS[name]);
    }
  });

  for (const scheme of ["light", "dark"] as const) {
    const colors = scheme === "light" ? light : dark;
    const c = (n: string) => colors[`--color-${n}`];

    it(`TB-AC12: ${scheme} theme gray bars differ from yellow bars by lightness, not only hue`, () => {
      expect(wcagRatio(c("sign"), c("bar"))).toBeGreaterThanOrEqual(1.5);
    });

    it(`TB-AC3: ${scheme} theme text pairs pass 4.5:1 and |Lc| >= 60`, () => {
      for (const [fg, bg] of TEXT_PAIRS) {
        expect(c(fg), fg).toBeDefined();
        expect(c(bg), bg).toBeDefined();
        expect(wcagRatio(c(fg), c(bg)), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
        expect(Math.abs(apcaLc(c(fg), c(bg))), `${fg} on ${bg} Lc`).toBeGreaterThanOrEqual(60);
      }
      expect(Math.abs(apcaLc(c("ink"), c("paper")))).toBeGreaterThanOrEqual(75);
    });

    it(`TB-AC3: ${scheme} theme non-text pairs pass 3:1`, () => {
      for (const [fg, bg] of NON_TEXT_PAIRS) {
        expect(wcagRatio(c(fg), c(bg)), `${fg} on ${bg}`).toBeGreaterThanOrEqual(3);
      }
    });
  }
});

describe("readThemeColors", () => {
  const sample = `
@import "tailwindcss";
@theme static {
  --color-paper: oklch(0.97 0.005 90);
  --color-ink: #111111;
  --color-alias: var(--color-ink);
  --font-sans: "Golos Text";
}
:root { color-scheme: light dark; }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --color-paper: oklch(0.2 0.01 260);
  }
}
:root[data-theme="dark"] {
  --color-paper: oklch(0.2 0.01 260);
}
/* legacy aliases: start (removed in T21) */
:root { --bg: #f6f7f9; }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { --bg: #0e1116; }
}
:root[data-theme="dark"] { --bg: #0e1116; --color-extra: oklch(0.3 0.01 260); }
@theme inline {
  --color-bg: var(--bg);
  --color-text: oklch(0.1 0 0);
}
/* legacy aliases: end */
`;

  it("TB-AC2: light returns only --color-* of the @theme static block", () => {
    expect(readThemeColors(sample, "light")).toEqual({
      "--color-paper": "oklch(0.97 0.005 90)",
      "--color-ink": "#111111",
    });
  });

  it("TB-AC2: dark merges the data-theme dark overrides over light", () => {
    expect(readThemeColors(sample, "dark")).toEqual({
      "--color-paper": "oklch(0.2 0.01 260)",
      "--color-ink": "#111111",
      "--color-extra": "oklch(0.3 0.01 260)",
    });
  });
});

describe("index.css structure", () => {
  it("TB-AC2: media dark block and data-theme dark block override identical variables", () => {
    const mediaStart = css.indexOf("@media (prefers-color-scheme: dark)");
    expect(mediaStart).toBeGreaterThanOrEqual(0);
    const media = colorDecls(braceBlock(css, mediaStart));
    const attrStart = css.indexOf(':root[data-theme="dark"]');
    expect(attrStart).toBeGreaterThanOrEqual(0);
    const attr = colorDecls(braceBlock(css, attrStart));
    expect(Object.keys(attr).length).toBeGreaterThan(0);
    expect(media).toEqual(attr);
    for (const [name, value] of Object.entries(DARK_OVERRIDES)) {
      expect(attr[`--color-${name}`], name).toBe(value);
    }
  });

  it("TB-AC2: tokens are in @theme static with motion tokens, color-scheme on :root", () => {
    const start = css.search(/@theme\s+static\s*\{/);
    expect(start).toBeGreaterThanOrEqual(0);
    const block = braceBlock(css, start);
    for (const token of [
      "--font-sans",
      "--font-mono",
      "--text-sm",
      "--text-flap-xs",
      "--text-base",
      "--text-lg",
      "--text-xl",
      "--text-flap-compact",
      "--text-flap-sm",
      "--text-flap-md",
      "--text-flap-lg",
      "--text-axis",
      "--text-sm--line-height",
      "--text-axis--line-height",
      "--spacing",
      "--radius-cell",
      "--radius-control",
      "--radius-board",
      "--ease-flap",
      "--ease-out",
      "--duration-flap",
      "--duration-settle",
      "--stagger-flap",
      "--duration-grow",
      "--duration-fast",
    ]) {
      expect(block, token).toMatch(new RegExp(`${token}\\s*:`));
    }
    expect(block).toMatch(/--duration-flap\s*:\s*380ms/);
    expect(block).toMatch(/--duration-settle\s*:\s*1000ms/);
    expect(block).toMatch(/--stagger-flap\s*:\s*45ms/);
    expect(block).toMatch(/--duration-grow\s*:\s*600ms/);
    expect(block).toMatch(/--duration-fast\s*:\s*150ms/);
    expect(block).toMatch(/--ease-flap\s*:\s*cubic-bezier\(0\.2,\s*0\.8,\s*0\.2,\s*1\)/);
    expect(block).toMatch(/--radius-cell\s*:\s*2px/);
    expect(block).toMatch(/--spacing\s*:\s*0\.25rem/);
    expect(css).toMatch(/:root\s*\{[^}]*color-scheme:\s*light dark/);
  });
});
