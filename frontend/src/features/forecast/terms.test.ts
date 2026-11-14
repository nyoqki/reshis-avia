import { describe, expect, it } from "vitest";
import { TERMS, type TermKey } from "./terms";

const NAMES: Record<TermKey, string> = {
  wants: "Желают купить",
  buys: "Купят",
  free: "Свободно",
  sellout: "Вероятность распродажи",
  recommended: "Рекомендуемая цена и коридор",
  risky: "Рискованный рейс",
  scenarios: "Сценарии",
};

describe("TERMS", () => {
  it("AC15: has the seven keys with the exact term names", () => {
    expect(Object.keys(TERMS).sort()).toEqual(Object.keys(NAMES).sort());
    for (const key of Object.keys(NAMES) as TermKey[]) {
      expect(TERMS[key].term).toBe(NAMES[key]);
      expect(TERMS[key].text.length).toBeGreaterThan(0);
    }
  });

  it("AC15: the risky text names the 15 % threshold", () => {
    expect(TERMS.risky.text).toContain("15 %");
  });

  it("AC15: the sellout text names «< 10 %» and «> 90 %» and the nine scenarios", () => {
    expect(TERMS.sellout.text).toContain("< 10 %");
    expect(TERMS.sellout.text).toContain("> 90 %");
    expect(TERMS.sellout.text).toMatch(/девят/);
  });

  it("AC15: the scenarios text names 10 %, 50 % (медиана) and 90 %", () => {
    const text = TERMS.scenarios.text;
    expect(text).toContain("10 %");
    expect(text).toContain("50 %");
    expect(text).toContain("90 %");
    expect(text).toMatch(/50 %[^.]*медиан/);
  });

  it("AC20: every text uses NBSP before %, «ёлочки» for quotes and no ASCII hyphen between numbers", () => {
    for (const { term, text } of Object.values(TERMS)) {
      for (const s of [term, text]) {
        expect(s).not.toMatch(/\d %/);
        expect(s).not.toContain('"');
        expect(s).not.toMatch(/\d-\d/);
      }
    }
  });
});
