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

export function buildChartModel(result: ForecastResponse): ChartModel {
  const { scenarios } = result;
  return {
    labels: scenarios.map((s) => labelFor(s.quantile)),
    values: scenarios.map((s) => displayWants(s.wants)),
    rawValues: scenarios.map((s) => s.wants),
    kinds: scenarios.map((s, i): BarKind => {
      if (s.hits_seats) return "hits";
      return i === MEDIAN_INDEX ? "median" : "below";
    }),
    seats: result.seats,
    medianIndex: MEDIAN_INDEX,
  };
}
