import { describe, expect, it } from "vitest";
import { DESIGN_SCAN_EXCLUDE, findDesignViolations, LEGACY_FILES } from "./designRules";

const rules = (source: string) => findDesignViolations("src/x.tsx", source).map((v) => v.rule);

describe("findDesignViolations", () => {
  it.each([
    ["colour", 'const c = "#fccf28";'],
    ["colour", "const c = 'rgb(0 0 0)';"],
    ["colour", "const c = 'oklch(0.5 0 0)';"],
    ["arbitrary", '<div className="p-[13px]" />'],
    ["arbitrary", '<div className="text-[15px]" />'],
    ["spacing", '<div className="p-5" />'],
    ["spacing", '<div className="gap-1.5" />'],
    ["spacing", '<div className="md:px-5" />'],
    ["spacing", '<div className="-mt-5" />'],
    ["default-scale", '<div className="text-xs" />'],
    ["default-scale", '<div className="rounded-lg" />'],
    ["default-scale", '<div className="shadow-md" />'],
    ["default-scale", '<div className="bg-white" />'],
  ] as const)("AC2: flags %s in %s", (rule, source) => {
    const found = findDesignViolations("src/x.tsx", source);
    expect(found.length).toBeGreaterThan(0);
    expect(found.map((v) => v.rule)).toContain(rule);
    expect(found[0].file).toBe("src/x.tsx");
  });

  it.each([
    '<div className="p-4" />',
    '<div className="gap-3" />',
    '<div className="px-px" />',
    '<div className="min-h-11" />',
    '<div className="w-full" />',
    '<div className="rounded-control" />',
    '<div className="text-flap-sm" />',
    '<div className="bg-[var(--color-board)]" />',
    '<svg className="fill-sign" />',
  ])("AC2: accepts %s", (source) => {
    expect(rules(source)).toEqual([]);
  });
});

function globToRegExp(pattern: string): RegExp {
  const p = pattern.replace(/^src\//, "");
  const body = p
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "@@GLOBSTAR@@")
    .replace(/\*/g, "[^/]*")
    .replace(/@@GLOBSTAR@@/g, ".*");
  return new RegExp(p.includes("/") ? `^${body}$` : `(^|/)${body}$`);
}

describe("project sources", () => {
  it("AC2: every src file outside the exclusions and legacy list has no violation", () => {
    const files = import.meta.glob("../**/*.{ts,tsx,css}", {
      query: "?raw",
      import: "default",
      eager: true,
    }) as Record<string, string>;
    const skip = [...DESIGN_SCAN_EXCLUDE, ...LEGACY_FILES].map(globToRegExp);
    const violations = Object.entries(files)
      .map(([key, source]) => [key.replace(/^\.\.\//, ""), source] as const)
      .filter(([rel]) => !skip.some((re) => re.test(rel)))
      .flatMap(([rel, source]) => findDesignViolations(`src/${rel}`, source));
    expect(violations).toEqual([]);
  });
});
