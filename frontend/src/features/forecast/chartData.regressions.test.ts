import { describe, expect, it } from "vitest";

import type { ForecastResponse, Scenario } from "../../api/types";
import { buildChartModel, tickLabel } from "./chartData";

const QUANTILES = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];

// The API clamps `wants` at 0 and sends the negative calculation only in `wants_raw`.
function clamped(raw: number[], seats: number): Scenario[] {
  return QUANTILES.map((quantile, i) => ({
    quantile,
    wants: Math.max(0, raw[i]),
    wants_raw: raw[i],
    buys: Math.max(0, Math.min(raw[i], seats)),
    hits_seats: raw[i] >= seats,
  }));
}

const NEGATIVE: ForecastResponse = {
  route: "MOW-LED",
  origin: "Москва",
  destination: "Санкт-Петербург",
  date: "2026-06-01",
  price: 20000,
  seats: 1440,
  wants: 0,
  wants_raw: -3120.0,
  buys: 0,
  free_seats: 1440,
  limit: "no_demand",
  base_price: 9000,
  price_min: 5400,
  price_max: 18000,
  price_in_range: false,
  scenarios: clamped([-5000, -4500, -4000, -3500, -3120, -2500, -1500, -500, 150], 1440),
  sellout: { low_pct: null, high_pct: 10 },
  recommendation: {
    price: 9500,
    corridor_low: 8500,
    corridor_high: 10200,
    corridor_pct: 12,
    risky: false,
  },
  history_id: 1,
};

describe("chartData regressions", () => {
  it("AC10: with the API's clamped wants the raw negatives come from wants_raw", () => {
    const model = buildChartModel(NEGATIVE);
    expect(model.values.slice(0, 8)).toEqual(Array(8).fill(0));
    expect(model.rawValues[0]).toBe(-5000);
    expect(model.rawValues[4]).toBe(-3120);
  });

  it("AC12: the axis ticks keep the scenario names for 10 %, 50 % and 90 %", () => {
    expect(tickLabel(0.1)).toEqual([expect.stringMatching(/^10\s%$/), "пессимистичный"]);
    expect(tickLabel(0.5)).toEqual([expect.stringMatching(/^50\s%$/), "медиана"]);
    expect(tickLabel(0.9)).toEqual([expect.stringMatching(/^90\s%$/), "оптимистичный"]);
    expect(tickLabel(0.2)).toMatch(/^20\s%$/);
  });
});
