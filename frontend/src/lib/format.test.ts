import { describe, expect, it } from "vitest";

import {
  displayWants,
  formatDate,
  formatRub,
  formatRubRange,
  formatSellout,
  formatSigned,
} from "./format";

const NBSP = " ";
const NNBSP = " ";

describe("formatSellout", () => {
  it("AC13: renders the edge bands and a range with NBSP before %", () => {
    expect(formatSellout({ low_pct: null, high_pct: 10 })).toBe(`< 10${NBSP}%`);
    expect(formatSellout({ low_pct: 90, high_pct: null })).toBe(`> 90${NBSP}%`);
    expect(formatSellout({ low_pct: 70, high_pct: 80 })).toBe(`≈ 70–80${NBSP}%`);
  });

  it("AC13: never renders 0 % or 100 %", () => {
    const samples = [
      formatSellout({ low_pct: null, high_pct: 10 }),
      formatSellout({ low_pct: 90, high_pct: null }),
      formatSellout({ low_pct: 70, high_pct: 80 }),
    ];
    for (const s of samples) {
      expect(s).not.toMatch(/(^|\D)0\s%/);
      expect(s).not.toMatch(/100/);
    }
  });
});

describe("displayWants", () => {
  it("AC10: clamps negatives to zero and keeps positives", () => {
    expect(displayWants(-3120)).toBe(0);
    expect(displayWants(970)).toBe(970);
  });
});

describe("formatRub", () => {
  it("AC19: uses a non-breaking group separator and NBSP before the ruble sign", () => {
    const out = formatRub(9000);
    expect(out.endsWith(`${NBSP}₽`)).toBe(true);
    const digits = out.slice(0, -2);
    expect(digits).toMatch(new RegExp(`^9[${NBSP}${NNBSP}]?000$`));
    expect(digits).not.toContain(" ");
  });

  it("groups larger numbers", () => {
    expect(formatRub(1234567)).toMatch(
      new RegExp(`^1[${NBSP}${NNBSP}]234[${NBSP}${NNBSP}]567${NBSP}₽$`),
    );
  });
});

describe("formatDate", () => {
  it("AC19: formats an ISO date in Russian", () => {
    expect(formatDate("2026-06-12")).toBe("12 июня 2026");
  });
});

describe("formatSigned", () => {
  it("AC10: a negative calculation gets a real minus sign and NBSP grouping", () => {
    expect(formatSigned(-3120)).toBe(`−3${NBSP}120`);
    expect(formatSigned(-708)).toBe("−708");
    expect(formatSigned(412)).toBe("412");
  });
});

describe("formatRubRange", () => {
  it("joins two prices with an en dash and one ruble sign", () => {
    expect(formatRubRange(5400, 18000)).toBe(`5${NBSP}400–18${NBSP}000${NBSP}₽`);
  });
});
