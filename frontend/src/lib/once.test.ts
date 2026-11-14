import { beforeEach, describe, expect, it } from "vitest";
import { claimOnce, resetOnceForTests } from "./once";

beforeEach(() => resetOnceForTests());

describe("claimOnce", () => {
  it("AC7: returns true once per key and false afterwards; resetOnceForTests clears it", () => {
    expect(claimOnce("a")).toBe(true);
    expect(claimOnce("a")).toBe(false);
    expect(claimOnce("b")).toBe(true);
    expect(claimOnce("b")).toBe(false);
    resetOnceForTests();
    expect(claimOnce("a")).toBe(true);
    expect(claimOnce("a")).toBe(false);
  });
});
