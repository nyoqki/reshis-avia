import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

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

const NO_DEMAND: ForecastResponse = {
  ...CONTROL,
  route: "MOW-LED",
  destination: "Санкт-Петербург",
  date: "2026-06-01",
  price: 20000,
  seats: 1440,
  wants: -3120,
  wants_raw: -3120,
  buys: 0,
  free_seats: 1440,
  limit: "no_demand",
  base_price: 5500,
  price_min: 3300,
  price_max: 11000,
  price_in_range: false,
  sellout: { low_pct: null, high_pct: 10 },
};

const SEATS: ForecastResponse = {
  ...CONTROL,
  route: "MOW-OVB",
  destination: "Новосибирск",
  date: "2026-06-20",
  price: 8000,
  seats: 270,
  wants: 400,
  wants_raw: 400,
  buys: 270,
  free_seats: 0,
  limit: "seats",
  sellout: { low_pct: 90, high_pct: null },
};

function card(label: string): HTMLElement {
  const el = screen.getByText(label);
  const parent = el.parentElement;
  if (!parent) throw new Error(`no card for ${label}`);
  return parent;
}

describe("ResultPanel", () => {
  it("AC9: for the control response the cards show 900, 970, 900, 0", () => {
    render(<ResultPanel result={CONTROL} onUseRecommended={() => {}} />);
    expect(card("Мест в самолёте")).toHaveTextContent("900");
    expect(card("Желают купить")).toHaveTextContent("970");
    expect(card("Купят")).toHaveTextContent("900");
    expect(card("Свободно")).toHaveTextContent(/^Свободно\s*0$/);
  });

  it("AC10: negative wants show 0 in the card, the raw value as visible text and the no-demand note", () => {
    render(<ResultPanel result={NO_DEMAND} onUseRecommended={() => {}} />);
    expect(card("Желают купить")).toHaveTextContent(/Желают купить\s*0/);
    expect(screen.getByText(/расчёт: −3\s120/)).toBeVisible();
    expect(screen.getByText(/при такой цене билет никто не купит/i)).toBeVisible();
    expect(card("Свободно")).toHaveTextContent("1 440");
  });

  it("AC10: a price outside the route range shows the warning", () => {
    render(<ResultPanel result={NO_DEMAND} onUseRecommended={() => {}} />);
    expect(screen.getByText(/вне диапазона маршрута/i)).toBeVisible();
  });

  it("AC10: no out-of-range warning for an in-range price", () => {
    render(<ResultPanel result={CONTROL} onUseRecommended={() => {}} />);
    expect(screen.queryByText(/вне диапазона маршрута/i)).toBeNull();
    expect(screen.queryByText(/расчёт:/)).toBeNull();
  });

  it("AC11: limit seats explains that sales hit the seat count and shows > 90 %", () => {
    render(<ResultPanel result={SEATS} onUseRecommended={() => {}} />);
    expect(screen.getByText(/продажи упираются в места/i)).toBeVisible();
    expect(screen.getByText(/>\s90\s%/)).toBeVisible();
  });

  it("AC13: the sell-out band is shown as a range", () => {
    render(<ResultPanel result={CONTROL} onUseRecommended={() => {}} />);
    expect(screen.getByText(/≈\s70–80\s%/)).toBeVisible();
  });

  it("AC14: the risky badge appears only when recommendation.risky", () => {
    const { rerender } = render(<ResultPanel result={CONTROL} onUseRecommended={() => {}} />);
    expect(screen.queryByText("Рискованный рейс: прогноз цены неуверенный")).toBeNull();

    rerender(
      <ResultPanel
        result={{
          ...CONTROL,
          recommendation: { ...CONTROL.recommendation, corridor_pct: 18, risky: true },
        }}
        onUseRecommended={() => {}}
      />,
    );
    expect(screen.getByText("Рискованный рейс: прогноз цены неуверенный")).toBeVisible();
  });

  it("AC14: shows the recommended price with its corridor", () => {
    render(<ResultPanel result={CONTROL} onUseRecommended={() => {}} />);
    expect(screen.getByText(/9\s500\s₽/)).toBeVisible();
    expect(screen.getByText(/8\s500/)).toBeVisible();
    expect(screen.getByText(/10\s200/)).toBeVisible();
  });

  it("AC14: «Подставить» calls onUseRecommended with the recommended price", async () => {
    const onUse = vi.fn();
    const user = userEvent.setup();
    render(<ResultPanel result={CONTROL} onUseRecommended={onUse} />);
    await user.click(screen.getByRole("button", { name: "Подставить" }));
    expect(onUse).toHaveBeenCalledTimes(1);
    expect(onUse).toHaveBeenCalledWith(9500);
  });
});
