import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ForecastResponse } from "../../api/types";

vi.mock("chart.js", () => {
  class Chart {
    static register() {}
    data: unknown;
    options: unknown;
    constructor(_ctx: unknown, config: { data?: unknown; options?: unknown }) {
      this.data = config?.data;
      this.options = config?.options;
    }
    update() {}
    destroy() {}
    resize() {}
  }
  const piece = class {};
  return {
    Chart,
    BarController: piece,
    BarElement: piece,
    LineController: piece,
    LineElement: piece,
    PointElement: piece,
    CategoryScale: piece,
    LinearScale: piece,
    Tooltip: piece,
    Legend: piece,
  };
});

import { ScenarioChart } from "./ScenarioChart";

const QUANTILES = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
const WANTS = [610, 680, 760, 850, 970, 1060, 1150, 1260, 1400];

const RESULT: ForecastResponse = {
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
  scenarios: QUANTILES.map((quantile, i) => ({
    quantile,
    wants: WANTS[i],
    wants_raw: WANTS[i],
    buys: Math.min(WANTS[i], 900),
    hits_seats: WANTS[i] >= 900,
  })),
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

describe("ScenarioChart", () => {
  it("AC12: renders a canvas with an aria-label mentioning seats and median, the 10% caption, and a 9-row scenario table", () => {
    const { container } = render(<ScenarioChart result={RESULT} />);

    const canvas = container.querySelector("canvas");
    expect(canvas).not.toBeNull();
    const label = canvas?.getAttribute("aria-label") ?? "";
    expect(label).toMatch(/мест/i);
    expect(label).toMatch(/медиан/i);

    expect(screen.getByText(/Между соседними столбиками/)).toHaveTextContent(/10\s?% вероятности/);

    const table = container.querySelector("table");
    expect(table).not.toBeNull();
    const body = table?.querySelectorAll("tbody tr") ?? [];
    expect(body).toHaveLength(9);
    const medianRow = body[4] as HTMLElement;
    expect(within(medianRow).getByText(/970/)).toBeInTheDocument();
    expect(within(medianRow).getByText(/900/)).toBeInTheDocument();
  });
});
