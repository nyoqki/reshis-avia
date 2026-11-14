import { describe, expect, it } from "vitest";

import type { ForecastResponse, Scenario } from "../../api/types";
import { buildChartModel } from "./chartData";

const QUANTILES = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];

function scenarios(wants: number[], seats: number): Scenario[] {
  return QUANTILES.map((quantile, i) => ({
    quantile,
    wants: wants[i],
    wants_raw: wants[i],
    buys: Math.max(0, Math.min(wants[i], seats)),
    hits_seats: wants[i] >= seats,
  }));
}

const BASE: ForecastResponse = {
  route: "MOW-AER",
  origin: "Москва",
  destination: "Сочи",
  date: "2026-06-12",
  price: 9000,
  seats: 900,
  wants: 970,
  wants_raw: 970,
  buys: 900,
  free_seats: 0,
  limit: "seats",
  base_price: 9000,
  price_min: 5400,
  price_max: 18000,
  price_in_range: true,
  scenarios: scenarios([610, 680, 760, 850, 970, 1060, 1150, 1260, 1400], 900),
  sellout: { low_pct: 70, high_pct: 80 },
  recommendation: {
    price: 9500,
    corridor_low: 8500,
    corridor_high: 10200,
    corridor_pct: 12,
    risky: false,
  },
  history_id: 1,
};

const CONTROL_12000: ForecastResponse = {
  ...BASE,
  price: 12000,
  wants: 412,
  wants_raw: 412,
  buys: 412,
  free_seats: 488,
  limit: "none",
  scenarios: scenarios([120, 210, 300, 360, 412, 470, 540, 640, 780], 900),
};

const OVB: ForecastResponse = {
  ...BASE,
  route: "MOW-OVB",
  destination: "Новосибирск",
  price: 8000,
  seats: 270,
  wants: 400,
  wants_raw: 400,
  buys: 270,
  scenarios: scenarios([280, 300, 330, 360, 400, 440, 480, 520, 600], 270),
};

const NEGATIVE: ForecastResponse = {
  ...BASE,
  route: "MOW-LED",
  price: 20000,
  seats: 1440,
  wants: -3120,
  wants_raw: -3120,
  buys: 0,
  free_seats: 1440,
  limit: "no_demand",
  scenarios: scenarios([-5000, -4600, -4000, -3500, -3120, -2500, -1800, -900, 150], 1440),
};

describe("buildChartModel", () => {
  it.each([
    ["9000", BASE],
    ["12000", CONTROL_12000],
  ])("AC12: the median value equals the card number for the %s control response", (_n, result) => {
    const model = buildChartModel(result);
    expect(model.medianIndex).toBe(4);
    expect(model.values).toHaveLength(9);
    expect(model.values[model.medianIndex]).toBe(result.wants);
    expect(model.rawValues[model.medianIndex]).toBe(result.wants_raw);
  });

  it("AC12: labels run 10 %..90 % with the named scenarios", () => {
    const model = buildChartModel(BASE);
    expect(model.labels).toHaveLength(9);
    expect(model.labels[0]).toMatch(/^10\s?%/);
    expect(model.labels[0]).toContain("пессимистичный");
    expect(model.labels[4]).toMatch(/^50\s?%/);
    expect(model.labels[4]).toContain("медиана");
    expect(model.labels[8]).toMatch(/^90\s?%/);
    expect(model.labels[8]).toContain("оптимистичный");
    expect(model.labels[1]).toMatch(/^20\s?%$/);
  });

  it("AC12: kinds mark below and hits against seats; the median keeps its group's colour", () => {
    const model = buildChartModel(BASE);
    expect(model.seats).toBe(900);
    expect(model.kinds).toEqual([
      "below",
      "below",
      "below",
      "below",
      "hits",
      "hits",
      "hits",
      "hits",
      "hits",
    ]);
    // The median is told apart by its outline only: a third colour for it was not in the legend and
    // switched between purple and orange from one flight to the next.
    const calm = buildChartModel(CONTROL_12000);
    expect(calm.kinds[4]).toBe("below");
    expect(new Set(calm.kinds)).toEqual(new Set(["below"]));
  });

  it("AC11: for the OVB response every kind is 'hits' and seats is 270", () => {
    const model = buildChartModel(OVB);
    expect(model.seats).toBe(270);
    expect(model.kinds).toEqual(Array(9).fill("hits"));
  });

  it("AC10: negative wants become 0 in values and keep the raw number in rawValues", () => {
    const model = buildChartModel(NEGATIVE);
    expect(model.values.every((v) => v >= 0)).toBe(true);
    expect(model.values.slice(0, 8)).toEqual(Array(8).fill(0));
    expect(model.values[8]).toBe(150);
    expect(model.rawValues[0]).toBe(-5000);
    expect(model.rawValues[4]).toBe(-3120);
    expect(model.values[4]).toBe(0);
    // one bar of 150 is enough for the chart to show something
    expect(model.empty).toBe(false);
  });

  it("AC10: the model is empty only when every scenario's demand is 0", () => {
    const none = {
      ...NEGATIVE,
      scenarios: NEGATIVE.scenarios.map((s) => ({ ...s, wants: 0, wants_raw: -1, buys: 0 })),
    };
    expect(buildChartModel(none).empty).toBe(true);
    expect(buildChartModel(BASE).empty).toBe(false);
  });
});
