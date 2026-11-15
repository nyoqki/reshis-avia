import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../../api/client";
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

  async function calculated() {
    vi.mocked(api.routes).mockResolvedValue(ROUTES);
    vi.mocked(api.forecast).mockResolvedValueOnce(RESPONSE);
    const user = userEvent.setup();
    render(<ForecastPage onSessionExpired={() => {}} />);
    const status = await screen.findByRole("status");
    await user.click(await screen.findByRole("button", { name: "Рассчитать" }));
    const use = await screen.findByRole("button", { name: "Подставить" });
    await waitFor(() => expect(status).toHaveTextContent(/Прогноз готов/));
    return { user, use, status };
  }

  it("AC14: after «Подставить» the status announces the substituted price and focus stays on the button", async () => {
    const { user, use, status } = await calculated();
    vi.mocked(api.forecast).mockResolvedValueOnce({ ...RESPONSE, price: 9500 });
    await user.click(use);

    await waitFor(() =>
      expect(status).toHaveTextContent(
        /Подставлена рекомендуемая цена 9\s500\s₽\. Прогноз готов\./,
      ),
    );
    expect(screen.getByRole("button", { name: "Подставить" })).toHaveFocus();
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("AC14: «Подставить» then a regular «Рассчитать» announces without the substitution prefix", async () => {
    const { user, use, status } = await calculated();
    vi.mocked(api.forecast).mockResolvedValueOnce({ ...RESPONSE, price: 9500 });
    await user.click(use);
    await waitFor(() => expect(status).toHaveTextContent(/Подставлена/));

    vi.mocked(api.forecast).mockResolvedValueOnce({ ...RESPONSE, buys: 800 });
    await user.click(screen.getByRole("button", { name: "Рассчитать" }));

    await waitFor(() => expect(status).toHaveTextContent(/купят: 800/));
    expect(status.textContent ?? "").toMatch(/^Прогноз готов\./);
    expect(status).not.toHaveTextContent(/Подставлена/);
  });

  it("AC14: a failed substituted request followed by a successful regular submit announces without the prefix", async () => {
    const { user, use, status } = await calculated();
    vi.mocked(api.forecast).mockRejectedValueOnce(new ApiError(500, "Сервер временно недоступен."));
    await user.click(use);
    expect(await screen.findByText("Сервер временно недоступен.")).toBeVisible();

    vi.mocked(api.forecast).mockResolvedValueOnce({ ...RESPONSE, buys: 800 });
    await user.click(screen.getByRole("button", { name: "Рассчитать" }));

    await waitFor(() => expect(status).toHaveTextContent(/купят: 800/));
    expect(status.textContent ?? "").toMatch(/^Прогноз готов\./);
  });
});
