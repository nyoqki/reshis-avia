import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ForecastResponse } from "../../api/types";
import { ResultPanel } from "./ResultPanel";

const CONTROL: ForecastResponse = {
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
  scenarios: [],
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

// The API clamps `wants` at 0 and sends the negative calculation only in `wants_raw`.
const NO_DEMAND: ForecastResponse = {
  ...CONTROL,
  route: "MOW-LED",
  destination: "Санкт-Петербург",
  date: "2026-06-01",
  price: 20000,
  seats: 1440,
  wants: 0,
  wants_raw: -3120.0,
  buys: 0,
  free_seats: 1440,
  limit: "no_demand",
};

describe("ResultPanel regressions", () => {
  it("AC10: with the API's clamped wants the raw negative figure is still shown", () => {
    render(<ResultPanel result={NO_DEMAND} onUseRecommended={() => {}} />);

    expect(screen.getByText(/по формуле:\s*−3\s120/)).toBeVisible();
  });

  it("AC14: corridor_pct is labelled as the full corridor width, not a ± deviation", () => {
    render(<ResultPanel result={CONTROL} onUseRecommended={() => {}} />);
    const corridor = screen.getByText(/^Коридор:/);
    expect(corridor).toHaveTextContent(/ширина 12\s%/);
    expect(corridor).not.toHaveTextContent("±");
  });
});
