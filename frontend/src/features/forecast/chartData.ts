import type { ForecastResponse } from "../../api/types";
import { displayWants } from "../../lib/format";

const NBSP = " ";

/** A bar is coloured by one thing only, whether demand reaches the seats; the median gets an outline. */
export type BarKind = "below" | "hits";

export interface ChartModel {
  labels: string[];
  values: number[];
  rawValues: number[];
  kinds: BarKind[];
  /** Every scenario's demand is 0: there are no bars to draw. */
  empty: boolean;
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
  const values = scenarios.map((s) => displayWants(s.wants));
  return {
    labels: scenarios.map((s) => labelFor(s.quantile)),
    values,
    // `wants` arrives clamped at 0; only `wants_raw` carries the negative calculation
    rawValues: scenarios.map((s) => Math.round(s.wants_raw)),
    kinds: scenarios.map((s): BarKind => (s.hits_seats ? "hits" : "below")),
    empty: values.every((v) => v === 0),
    seats: result.seats,
    medianIndex: MEDIAN_INDEX,
  };
}
