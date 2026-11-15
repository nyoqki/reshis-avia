import { describe, expect, it } from "vitest";
import indexCss from "../index.css?raw";
import { DESIGN_SCAN_EXCLUDE, findDesignViolations } from "./designRules";

function globToRegExp(pattern: string): RegExp {
  const p = pattern.replace(/^src\//, "");
  const body = p
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "@@GLOBSTAR@@")
    .replace(/\*/g, "[^/]*")
    .replace(/@@GLOBSTAR@@/g, ".*");
  return new RegExp(p.includes("/") ? `^${body}$` : `(^|/)${body}$`);
}

const files = import.meta.glob("../**/*.{ts,tsx,css}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

describe("design system", () => {
  it("TB-AC2: no file in src outside DESIGN_SCAN_EXCLUDE has a design violation of any rule", () => {
    const skip = DESIGN_SCAN_EXCLUDE.map(globToRegExp);
    const scanned = Object.entries(files)
      .map(([key, source]) => [key.replace(/^\.\.\//, ""), source] as const)
      .filter(([rel]) => !skip.some((re) => re.test(rel)));
    expect(scanned.length).toBeGreaterThan(20);
    const violations = scanned.flatMap(([rel, source]) =>
      findDesignViolations(`src/${rel}`, source),
    );
    expect(violations).toEqual([]);
  });

  it("TB-AC2: the legacy variables and classes are absent from index.css", () => {
    const legacyVars = [
      "--bg",
      "--surface",
      "--text",
      "--muted",
      "--border",
      "--accent",
      "--accent-text",
      "--demand-below",
      "--demand-hits",
      "--demand-hits-text",
    ];
    for (const v of legacyVars) {
      expect(indexCss, v).not.toMatch(new RegExp(`${v}(?![\\w-])\\s*:`));
    }
    expect(indexCss).not.toMatch(
      /--color-(?:bg|surface|text|muted|border|accent|demand-[\w-]+)\s*:/,
    );
    expect(indexCss).not.toContain("legacy aliases");
    for (const cls of [".shell", ".app-header", ".theme-toggle"]) {
      expect(indexCss, cls).not.toMatch(new RegExp(`${cls.replace(".", "\\.")}(?![\\w])`));
    }
  });

  it("TB-AC2: index.css @theme static starts with the namespace resets", () => {
    const m = indexCss.match(/@theme\s+static\s*\{([\s\S]*?)\n\}/);
    expect(m).not.toBeNull();
    const decls = (m?.[1] ?? "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split(";")
      .map((d) => d.trim())
      .filter(Boolean);
    expect(decls.slice(0, 4)).toEqual([
      "--color-*: initial",
      "--radius-*: initial",
      "--shadow-*: initial",
      "--text-*: initial",
    ]);
  });
});
