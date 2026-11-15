import { describe, expect, it } from "vitest";

import { MAX_CABIN_HEIGHT, seatLayout } from "./seatLayout";

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

  it("TB-AC11: wants above seats queues every extra passenger as one block of seat-sized units", () => {
    const small = seatLayout({ seats: 270, buys: 270, wants: 275, width: 320 });
    const step = small.unit + small.gap;
    expect(small.queue).toMatchObject({ count: 5, columns: 5, rows: 1 });
    expect(small.queue.width).toBe(5 * step - small.gap);
    expect(small.queue.height).toBe(small.unit);
    expect(count(small.queue.path)).toBe(1);

    // 70 people: a compact block, no empty row, one outline that the hatch fills edge to edge
    const big = seatLayout({ seats: 270, buys: 270, wants: 340, width: 320 });
    const q = big.queue;
    expect(q.count).toBe(70);
    expect(q.columns * q.rows).toBeGreaterThanOrEqual(70);
    expect((q.rows - 1) * q.columns).toBeLessThan(70);
    expect(q.rows).toBeLessThanOrEqual(4);
    expect(q.width).toBe(q.columns * (big.unit + big.gap) - big.gap);
    expect(q.height).toBe(q.rows * (big.unit + big.gap) - big.gap);
    expect(count(q.path)).toBe(1);
    // the whole count is drawn: no «+N» remainder
    expect(q).not.toHaveProperty("more");
  });

  it("TB-AC11: wants at or below seats gives an empty queue", () => {
    for (const wants of [0, 100, 270]) {
      const l = seatLayout({ seats: 270, buys: 100, wants, width: 320 });
      expect(l.queue).toMatchObject({ count: 0, width: 0, height: 0 });
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

  // The phone boards (360 and 390 px) and the desktop board.
  const WIDTHS = [294, 324, 582];
  const PLANES = [270, 900, 1440];

  it("TB-AC11: the cabin spans the board: less than one seat step is left on the right", () => {
    for (const width of WIDTHS) {
      for (const seats of PLANES) {
        const l = seatLayout({ seats, buys: seats, wants: seats, width });
        const step = l.unit + l.gap;
        const used = l.columns * step - l.gap;
        expect(used, `${seats} seats at ${width} px`).toBeLessThanOrEqual(width);
        expect(width - used, `${seats} seats at ${width} px`).toBeLessThan(step);
      }
    }
  });

  it("TB-AC11: no plane is drawn taller than MAX_CABIN_HEIGHT, so the map stays below the numbers in weight", () => {
    expect(MAX_CABIN_HEIGHT).toBeLessThanOrEqual(120);
    for (const width of WIDTHS) {
      for (const seats of PLANES) {
        const l = seatLayout({ seats, buys: seats, wants: seats, width });
        expect(l.height, `${seats} seats at ${width} px`).toBeLessThanOrEqual(MAX_CABIN_HEIGHT);
        expect(l.rows * (l.unit + l.gap) - l.gap).toBe(l.height);
      }
    }
  });
});
