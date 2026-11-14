export interface DesignViolation {
  file: string;
  rule: "colour" | "arbitrary" | "spacing" | "default-scale";
  match: string;
}

/** Paths (relative to src/) the design scan never reads. */
export const DESIGN_SCAN_EXCLUDE: readonly string[] = [
  "*.test.*",
  "src/test/**",
  "src/design/**",
  "src/index.css",
  "src/styles/fonts.css",
  "src/features/auth/plane/airliner.ts",
];

/** Pre-redesign files that T21 cleans; exempt until then. */
export const LEGACY_FILES: readonly string[] = [
  "App.tsx",
  "components/AppHeader.tsx",
  "components/ThemeToggle.tsx",
  "features/auth/AuthScreen.tsx",
  "features/forecast/ForecastForm.tsx",
  "features/forecast/ForecastPage.tsx",
  "features/forecast/ResultPanel.tsx",
  "features/forecast/ScenarioChart.tsx",
  "features/history/HistoryPanel.tsx",
];

const COLOUR_RE =
  /#(?:[\da-f]{8}|[\da-f]{6}|[\da-f]{3,4})(?![\w-])|\b(?:rgba?|hsla?|oklch|oklab)\(/gi;
const STRING_RE = /(["'`])((?:\\.|(?!\1)[^\\])*)\1/gs;
const SPACING_RE =
  /^(?:p[xytrblse]?|m[xytrblse]?|gap(?:-[xy])?|space-[xy]|inset(?:-[xy])?|top|right|bottom|left)-(\d+(?:\.\d+)?)$/;
const SPACING_STEPS = new Set(["0", "1", "2", "3", "4", "6", "8", "12", "16"]);
const PALETTE =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const COLOUR_UTIL =
  "bg|text|border(?:-[xytrblse])?|ring|ring-offset|fill|stroke|from|to|via|divide|outline|decoration|accent|caret|placeholder|shadow";
const PALETTE_RE = new RegExp(
  `^(?:${COLOUR_UTIL})-(?:(?:${PALETTE})-\\d{2,3}|white|black)(?:/[\\w.]+)?$`,
);
const DEFAULT_TEXT_RE = /^text-(?:xs|[2-9]xl)$/;
const DEFAULT_ROUNDED_RE =
  /^rounded(?:-(?:[trblse]|tl|tr|bl|br|ss|se|ee|es))?(?:-(?:sm|md|lg|xl|2xl|3xl))?$/;
const DEFAULT_SHADOW_RE = /^shadow(?:-(?!none$)[\w-]+)?$/;
const ARBITRARY_RE = /^[a-z][\w-]*-\[([^\]]+)\]$/;

function stripComments(source: string, file: string): string {
  const noBlock = source.replace(/\/\*[\s\S]*?\*\//g, " ");
  if (file.endsWith(".css")) return noBlock;
  return noBlock.replace(/(^|[\s;,{(])\/\/.*$/gm, "$1");
}

/** Drops variants (md:, hover:, data-[x]:), the important and negative markers. */
function utilityOf(token: string): string {
  let depth = 0;
  let start = 0;
  for (let i = 0; i < token.length; i++) {
    const ch = token[i];
    if (ch === "[") depth++;
    else if (ch === "]") depth--;
    else if (ch === ":" && depth === 0) start = i + 1;
  }
  return token.slice(start).replace(/^!/, "").replace(/!$/, "").replace(/^-/, "");
}

function checkClassToken(token: string): DesignViolation["rule"] | null {
  const util = utilityOf(token);
  const arbitrary = util.match(ARBITRARY_RE);
  if (arbitrary) return arbitrary[1].startsWith("var(--") ? null : "arbitrary";
  const spacing = util.match(SPACING_RE);
  if (spacing) return SPACING_STEPS.has(spacing[1]) ? null : "spacing";
  if (
    DEFAULT_TEXT_RE.test(util) ||
    DEFAULT_ROUNDED_RE.test(util) ||
    DEFAULT_SHADOW_RE.test(util) ||
    PALETTE_RE.test(util)
  ) {
    return "default-scale";
  }
  return null;
}

export function findDesignViolations(file: string, source: string): DesignViolation[] {
  const code = stripComments(source, file);
  const found: DesignViolation[] = [];
  for (const m of code.matchAll(COLOUR_RE)) {
    found.push({ file, rule: "colour", match: m[0] });
  }
  if (!file.endsWith(".css")) {
    for (const literal of code.matchAll(STRING_RE)) {
      for (const token of literal[2].split(/\s+/)) {
        if (!token) continue;
        const rule = checkClassToken(token);
        if (rule) found.push({ file, rule, match: token });
      }
    }
  }
  return found;
}
