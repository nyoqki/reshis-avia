import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ForecastResponse, HistoryItem, RoutesResponse } from "../../api/types";
import { ForecastPage } from "./ForecastPage";

vi.mock("../../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/client")>();
  return {
    ...actual,
    api: { ...actual.api, routes: vi.fn(), forecast: vi.fn(), history: vi.fn() },
  };
});

import { api } from "../../api/client";

const ROUTES: RoutesResponse = {
  origin: "Москва",
  date_min: "2026-06-01",
  date_max: "2026-07-01",
  routes: [
    {
      code: "MOW-AER",
      origin: "Москва",
      destination: "Сочи",
      base_price: 9000,
      price_min: 5400,
      price_max: 18000,
    },
    {
      code: "MOW-KZN",
      origin: "Москва",
      destination: "Казань",
      base_price: 7000,
      price_min: 4200,
      price_max: 14000,
    },
  ],
};

const RESPONSE: ForecastResponse = {
  route: "MOW-AER",
  origin: "Москва",
  destination: "Сочи",
  date: "2026-06-01",
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

beforeEach(() => {
  vi.mocked(api.routes).mockReset();
  vi.mocked(api.forecast).mockReset();
  vi.mocked(api.history).mockReset();
  vi.mocked(api.history).mockResolvedValue({ items: [] });
});

describe("ForecastPage regressions", () => {
  it("AC19: a routes reply without routes shows the error state instead of crashing", async () => {
    // e.g. a stubbed or misrouted fetch answering /api/routes with another endpoint's body
    vi.mocked(api.routes).mockResolvedValue({
      demo_enabled: true,
      registration_open: true,
    } as unknown as RoutesResponse);
    render(<ForecastPage onSessionExpired={() => {}} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Что-то пошло не так. Попробуйте ещё раз.",
    );
    expect(screen.getByRole("button", { name: "Повторить" })).toBeVisible();
  });

  it("AC19: a new result is announced through a polite live region", async () => {
    vi.mocked(api.routes).mockResolvedValue(ROUTES);
    vi.mocked(api.forecast).mockResolvedValue(RESPONSE);
    const user = userEvent.setup();
    render(<ForecastPage onSessionExpired={() => {}} />);
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("");

    await user.click(await screen.findByRole("button", { name: "Рассчитать" }));

    await waitFor(() =>
      expect(status).toHaveTextContent(
        /Прогноз готов\. Желают купить: 970, купят: 900, мест в самолёте: 900\./,
      ),
    );
  });

  it("AC16: choosing a history entry moves focus back to the form", async () => {
    const item: HistoryItem = {
      id: 5,
      route: "MOW-KZN",
      origin: "Москва",
      destination: "Казань",
      date: "2026-06-20",
      price: 8300,
      seats: 900,
      wants: 700,
      buys: 650,
      created_at: "2026-05-02T10:30:00Z",
    };
    vi.mocked(api.routes).mockResolvedValue(ROUTES);
    vi.mocked(api.history).mockResolvedValue({ items: [item] });
    const user = userEvent.setup();
    render(<ForecastPage onSessionExpired={() => {}} />);

    const entries = await screen.findAllByRole("button", { name: /Казань/ });
    await user.click(entries[0]);

    expect(screen.getByLabelText("Куда")).toHaveValue("Казань");
    expect(screen.getByLabelText("Куда")).toHaveFocus();
  });
});
