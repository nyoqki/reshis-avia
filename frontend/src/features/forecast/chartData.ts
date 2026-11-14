import type { ForecastResponse } from "../../api/types";
import { displayWants } from "../../lib/format";

const NBSP = " ";

export type BarKind = "below" | "median" | "hits";

export interface ChartModel {
  labels: string[];
  values: number[];
  rawValues: number[];
  kinds: BarKind[];
  seats: number;
  medianIndex: 4;
}

const MEDIAN_INDEX = 4;

const NAMES: Record<number, string> = {
  0.1: "пессимистичный",
  0.5: "медиана",
  0.9: "оптимистичный",
};

function labelFor(quantile: number): string {
  const pct = Math.round(quantile * 100);
  const name = NAMES[quantile];
  return name ? `${pct}${NBSP}% ${name}` : `${pct}${NBSP}%`;
}

/** An x-axis tick: the percentage, with the scenario name on a second line where there is one. */
export function tickLabel(quantile: number): string | string[] {
  const pct = `${Math.round(quantile * 100)}${NBSP}%`;
  const name = NAMES[quantile];
  return name ? [pct, name] : pct;
}

export function buildChartModel(result: ForecastResponse): ChartModel {
  const { scenarios } = result;
  return {
    labels: scenarios.map((s) => labelFor(s.quantile)),
    values: scenarios.map((s) => displayWants(s.wants)),
    // `wants` arrives clamped at 0; only `wants_raw` carries the negative calculation
    rawValues: scenarios.map((s) => Math.round(s.wants_raw)),
    kinds: scenarios.map((s, i): BarKind => {
      if (s.hits_seats) return "hits";
      return i === MEDIAN_INDEX ? "median" : "below";
    }),
    seats: result.seats,
    medianIndex: MEDIAN_INDEX,
  };
}
