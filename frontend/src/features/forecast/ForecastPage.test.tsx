import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../../api/client";
import type { ForecastResponse, RoutesResponse } from "../../api/types";
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

describe("ForecastPage routes loading", () => {
  it("AC19: shows a loading state while routes load, then the form", async () => {
    let resolve: (r: RoutesResponse) => void = () => {};
    vi.mocked(api.routes).mockReturnValue(
      new Promise<RoutesResponse>((r) => {
        resolve = r;
      }),
    );
    const { container } = render(<ForecastPage onSessionExpired={() => {}} />);

    expect(screen.queryByRole("button", { name: "Рассчитать" })).toBeNull();
    expect(container.querySelector("[aria-busy='true'], .skeleton")).not.toBeNull();

    resolve(ROUTES);
    expect(await screen.findByRole("button", { name: "Рассчитать" })).toBeVisible();
  });

  it("AC19: a failed routes load shows the error and «Повторить» refetches and renders the form", async () => {
    vi.mocked(api.routes)
      .mockRejectedValueOnce(new ApiError(500, "Сервер временно недоступен."))
      .mockResolvedValueOnce(ROUTES);
    const user = userEvent.setup();
    render(<ForecastPage onSessionExpired={() => {}} />);

    expect(await screen.findByText("Сервер временно недоступен.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Повторить" }));

    expect(await screen.findByRole("button", { name: "Рассчитать" })).toBeVisible();
    expect(api.routes).toHaveBeenCalledTimes(2);
  });

  it("AC1/AC19: a 401 on routes calls onSessionExpired", async () => {
    vi.mocked(api.routes).mockRejectedValue(new ApiError(401, "Нужно войти в аккаунт."));
    const onExpired = vi.fn();
    render(<ForecastPage onSessionExpired={onExpired} />);
    await waitFor(() => expect(onExpired).toHaveBeenCalledTimes(1));
  });
});

describe("ForecastPage submit", () => {
  async function submit(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole("button", { name: "Рассчитать" }));
  }

  it("AC9: a successful submit renders the result panel", async () => {
    vi.mocked(api.routes).mockResolvedValue(ROUTES);
    vi.mocked(api.forecast).mockResolvedValue(RESPONSE);
    const user = userEvent.setup();
    render(<ForecastPage onSessionExpired={() => {}} />);
    await submit(user);
    expect(await screen.findByText("Мест в самолёте")).toBeVisible();
    expect(screen.getByText("Желают купить")).toBeVisible();
  });

  it("AC19: a submit failing with status 0 shows the network message and «Повторить» resubmits", async () => {
    vi.mocked(api.routes).mockResolvedValue(ROUTES);
    vi.mocked(api.forecast)
      .mockRejectedValueOnce(
        new ApiError(0, "Нет связи с сервером. Проверьте интернет и попробуйте ещё раз."),
      )
      .mockResolvedValueOnce(RESPONSE);
    const user = userEvent.setup();
    render(<ForecastPage onSessionExpired={() => {}} />);
    await submit(user);

    expect(await screen.findByText(/Нет связи с сервером/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Повторить" }));

    await waitFor(() => expect(api.forecast).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.forecast).mock.calls[1][0]).toEqual(
      vi.mocked(api.forecast).mock.calls[0][0],
    );
    expect(await screen.findByText("Мест в самолёте")).toBeVisible();
  });

  it("AC19: a 429 with retryAfter 60 shows the wait message", async () => {
    vi.mocked(api.routes).mockResolvedValue(ROUTES);
    vi.mocked(api.forecast).mockRejectedValue(
      new ApiError(429, "Слишком много запросов. Попробуйте чуть позже.", {}, 60),
    );
    const user = userEvent.setup();
    render(<ForecastPage onSessionExpired={() => {}} />);
    await submit(user);

    expect(await screen.findByText(/60\s(сек|с\b)|минут/i)).toBeVisible();
  });

  it("AC19: another server error shows its detail and «Повторить»", async () => {
    vi.mocked(api.routes).mockResolvedValue(ROUTES);
    vi.mocked(api.forecast).mockRejectedValue(new ApiError(500, "Сервер временно недоступен."));
    const user = userEvent.setup();
    render(<ForecastPage onSessionExpired={() => {}} />);
    await submit(user);

    expect(await screen.findByText("Сервер временно недоступен.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Повторить" })).toBeVisible();
  });

  it("AC1/AC19: a 401 on submit calls onSessionExpired", async () => {
    vi.mocked(api.routes).mockResolvedValue(ROUTES);
    vi.mocked(api.forecast).mockRejectedValue(new ApiError(401, "Нужно войти в аккаунт."));
    const onExpired = vi.fn();
    const user = userEvent.setup();
    render(<ForecastPage onSessionExpired={onExpired} />);
    await submit(user);
    await waitFor(() => expect(onExpired).toHaveBeenCalledTimes(1));
  });
});
