import { describe, expect, it } from "vitest";
import type { ForecastResponse } from "../../api/types";
import { type BarKind, buildChartModel, type ChartModel } from "./chartData";
import { type ChartBox, layoutChart, niceTicks } from "./chartGeometry";

const BOX: ChartBox = { width: 600, height: 300, top: 20, right: 10, bottom: 40, left: 50 };

function model(values: number[], seats: number): ChartModel {
  return {
    labels: values.map((_, i) => `s${i}`),
    values,
    rawValues: values,
    kinds: values.map((v): BarKind => (v >= seats ? "hits" : "below")),
    empty: values.every((v) => v === 0),
    seats,
    medianIndex: 4,
  };
}

const VALUES = [100, 200, 300, 400, 500, 600, 700, 800, 998];

describe("niceTicks", () => {
  it("AC12: niceTicks(998) gives 0, 250, 500, 750, 1000 with ru-RU labels", () => {
    const ticks = niceTicks(998);
    expect(ticks.map((t) => t.value)).toEqual([0, 250, 500, 750, 1000]);
    expect(ticks.map((t) => t.label)).toEqual(["0", "250", "500", "750", "1 000"]);
  });

  it("AC12: niceTicks(0) still returns a zero baseline and a positive top", () => {
    expect(niceTicks(0)).toEqual([
      { value: 0, label: "0" },
      { value: 1, label: "1" },
    ]);
    expect(niceTicks(-5)[0].value).toBe(0);
  });

  it("AC12: ticks start at 0, cover maxValue and stay within maxTicks", () => {
    for (const max of [1, 7, 42, 130, 999, 4321, 25000]) {
      const ticks = niceTicks(max);
      expect(ticks[0].value).toBe(0);
      expect(ticks[ticks.length - 1].value).toBeGreaterThanOrEqual(max);
      expect(ticks.length).toBeLessThanOrEqual(6);
      const step = ticks[1].value - ticks[0].value;
      for (const [i, t] of ticks.entries()) {
        expect(t.value).toBeCloseTo(i * step);
      }
    }
    expect(niceTicks(998, 2).length).toBeLessThanOrEqual(3);
  });
});

describe("layoutChart", () => {
  it("AC12: yMax covers both the largest scenario and the seats count; ticks run from the plot bottom upwards", () => {
    const g = layoutChart(model(VALUES, 1200), BOX);
    expect(g.yMax).toBe(niceTicks(1200).at(-1)!.value);
    expect(g.yMax).toBeGreaterThanOrEqual(1200);

    const g2 = layoutChart(model(VALUES, 300), BOX);
    expect(g2.yMax).toBe(niceTicks(998).at(-1)!.value);

    const plotBottom = g.plot.y + g.plot.height;
    expect(g.ticks[0].value).toBe(0);
    expect(g.ticks[0].y).toBeCloseTo(plotBottom);
    expect(g.ticks.at(-1)!.y).toBeCloseTo(g.plot.y);
    for (let i = 1; i < g.ticks.length; i++) {
      expect(g.ticks[i].y).toBeLessThan(g.ticks[i - 1].y);
    }
    expect(g.plot.x).toBeCloseTo(BOX.left);
    expect(g.plot.width).toBeCloseTo(BOX.width - BOX.left - BOX.right);
    expect(g.plot.height).toBeCloseTo(BOX.height - BOX.top - BOX.bottom);
  });

  it("AC12: every bar starts at the plot bottom; a zero value has height 0", () => {
    const g = layoutChart(model([0, 200, 300, 400, 500, 600, 700, 800, 998], 900), BOX);
    const plotBottom = g.plot.y + g.plot.height;
    expect(g.bars).toHaveLength(9);
    for (const bar of g.bars) {
      expect(bar.y + bar.height).toBeCloseTo(plotBottom);
    }
    expect(g.bars[0].height).toBe(0);
    expect(g.bars[8].height).toBeGreaterThan(g.bars[1].height);
    expect(g.bars[8].height).toBeCloseTo((998 / g.yMax) * g.plot.height);
  });

  it("AC12/AC11: a hits bar's seatsY equals the seats line y and lies inside the bar; below bars have seatsY null", () => {
    const g = layoutChart(model(VALUES, 450), BOX);
    const plotBottom = g.plot.y + g.plot.height;
    expect(g.seatsY).toBeCloseTo(plotBottom - (450 / g.yMax) * g.plot.height);
    g.bars.forEach((bar, i) => {
      if (VALUES[i] >= 450) {
        expect(bar.seatsY).not.toBeNull();
        expect(bar.seatsY).toBeCloseTo(g.seatsY);
        expect(bar.seatsY!).toBeGreaterThanOrEqual(bar.y);
        expect(bar.seatsY!).toBeLessThanOrEqual(bar.y + bar.height);
        expect(bar.kind).toBe("hits");
      } else {
        expect(bar.seatsY).toBeNull();
        expect(bar.kind).toBe("below");
      }
    });
  });

  it("AC12: the median flag is set on index 4 only; nine bars have equal widths and stay inside the plot", () => {
    const g = layoutChart(model(VALUES, 450), BOX);
    expect(g.bars.map((b) => b.median)).toEqual([
      false,
      false,
      false,
      false,
      true,
      false,
      false,
      false,
      false,
    ]);
    expect(g.bars.map((b) => b.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    const w = g.bars[0].width;
    expect(w).toBeGreaterThan(0);
    for (const b of g.bars) expect(b.width).toBeCloseTo(w);
    for (let i = 1; i < g.bars.length; i++) {
      expect(g.bars[i].x).toBeGreaterThanOrEqual(g.bars[i - 1].x + w - 1e-6);
      expect(g.bars[i].x - g.bars[i - 1].x).toBeCloseTo(g.bars[1].x - g.bars[0].x);
    }
    expect(g.bars[0].x).toBeGreaterThanOrEqual(g.plot.x - 1e-6);
    expect(g.bars[8].x + w).toBeLessThanOrEqual(g.plot.x + g.plot.width + 1e-6);
  });

  it("AC1: a model with no scenarios yields no bars and does not throw", () => {
    const result = { seats: 900, scenarios: [] } as unknown as ForecastResponse;
    const empty = buildChartModel(result);
    expect(() => layoutChart(empty, BOX)).not.toThrow();
    const g = layoutChart(empty, BOX);
    expect(g.bars).toEqual([]);
    expect(g.yMax).toBeGreaterThanOrEqual(900);
    expect(g.ticks[0].value).toBe(0);
  });
});
