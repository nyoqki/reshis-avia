import { describe, expect, it } from "vitest";

import { QUEUE_MAX, seatLayout } from "./seatLayout";

const count = (path: string) => (path.match(/M/g) ?? []).length;

describe("seatLayout", () => {
  it("TB-AC11: filledPath has buys subpaths and freePath seats - buys subpaths", () => {
    const l = seatLayout({ seats: 300, buys: 120, wants: 120, width: 320 });
    expect(count(l.filledPath)).toBe(120);
    expect(count(l.freePath)).toBe(180);
  });

  it("TB-AC11: buys above seats fills every seat and leaves none free", () => {
    const l = seatLayout({ seats: 270, buys: 300, wants: 300, width: 320 });
    expect(count(l.filledPath)).toBe(270);
    expect(l.freePath).toBe("");
  });

  it("TB-AC11: wants above seats queues the overflow, capped at QUEUE_MAX", () => {
    expect(QUEUE_MAX).toBe(12);
    const small = seatLayout({ seats: 270, buys: 270, wants: 275, width: 320 });
    expect(small.queue).toMatchObject({ count: 5, shown: 5, more: 0 });
    expect(count(small.queue.path)).toBeGreaterThan(0);

    const big = seatLayout({ seats: 270, buys: 270, wants: 340, width: 320 });
    expect(big.queue).toMatchObject({ count: 70, shown: QUEUE_MAX, more: 70 - QUEUE_MAX });
  });

  it("TB-AC11: wants at or below seats gives an empty queue", () => {
    for (const wants of [0, 100, 270]) {
      const l = seatLayout({ seats: 270, buys: 100, wants, width: 320 });
      expect(l.queue).toMatchObject({ count: 0, shown: 0, more: 0 });
      expect(l.queue.path).toBe("");
    }
  });

  it("TB-AC11: 1440 seats fit a 296 px width with unit >= 3 and 270 seats get a larger unit", () => {
    const big = seatLayout({ seats: 1440, buys: 1000, wants: 1000, width: 296 });
    expect(big.unit).toBeGreaterThanOrEqual(3);
    expect(big.columns * big.rows).toBeGreaterThanOrEqual(1440);
    expect(big.columns * big.unit + (big.columns - 1) * big.gap).toBeLessThanOrEqual(296);
    const small = seatLayout({ seats: 270, buys: 100, wants: 100, width: 296 });
    expect(small.unit).toBeGreaterThan(big.unit);
  });

  it("TB-AC11: buys 0 (no demand) gives an empty filledPath", () => {
    const l = seatLayout({ seats: 270, buys: 0, wants: 0, width: 320 });
    expect(l.filledPath).toBe("");
    expect(count(l.freePath)).toBe(270);
  });
});
