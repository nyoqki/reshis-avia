import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../../api/client";
import type { ForecastRequest, ForecastResponse, RoutesResponse } from "../../api/types";
import { ForecastForm } from "./ForecastForm";
import { ForecastPage } from "./ForecastPage";

vi.mock("../../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/client")>();
  return { ...actual, api: { ...actual.api, routes: vi.fn(), forecast: vi.fn() } };
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
      code: "MOW-LED",
      origin: "Москва",
      destination: "Санкт-Петербург",
      base_price: 5500,
      price_min: 3300,
      price_max: 11000,
    },
  ],
};

const VALUE: ForecastRequest = {
  origin: "Москва",
  destination: "Сочи",
  date: "2026-06-12",
  price: 9000,
};

const RESPONSE: ForecastResponse = {
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

function Harness({
  pending = false,
  errors = {},
  onSubmit = () => {},
}: {
  pending?: boolean;
  errors?: Record<string, string>;
  onSubmit?: () => void;
}) {
  const [value, setValue] = useState<ForecastRequest>(VALUE);
  return (
    <ForecastForm
      routes={ROUTES}
      value={value}
      onChange={setValue}
      onSubmit={onSubmit}
      pending={pending}
      errors={errors}
    />
  );
}

beforeEach(() => {
  vi.mocked(api.routes).mockReset();
  vi.mocked(api.forecast).mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ForecastForm", () => {
  it("AC15: the date input is limited to the data range from routes", () => {
    render(<Harness />);
    const date = screen.getByLabelText(/^Дата/);
    expect(date).toHaveAttribute("min", "2026-06-01");
    expect(date).toHaveAttribute("max", "2026-07-01");
  });

  it("AC9: shows the route price range and base price as a hint", () => {
    render(<Harness />);
    const text = /Диапазон маршрута: 5\s400–18\s000\s₽, базовая цена 9\s000\s₽/;
    expect(screen.getByText(text)).toBeVisible();
    expect(screen.getByLabelText(/^Цена билета/)).toHaveAccessibleDescription(text);
  });

  it("AC10/TB-AC19: a price outside the route range turns the hint into a warning next to the field", async () => {
    // The API accepts such a price (spec: a warning, not an error), so the input is not marked invalid.
    const user = userEvent.setup();
    render(<Harness />);
    const price = screen.getByLabelText(/^Цена билета/);
    await user.clear(price);
    await user.type(price, "50000");
    const text = /Цена вне диапазона маршрута: 5\s400–18\s000\s₽/;
    const warning = screen.getByText(text);
    expect(warning).toBeVisible();
    expect(warning).toHaveClass("text-warning");
    expect(price).toHaveAccessibleDescription(text);
    expect(price).not.toHaveAttribute("aria-invalid");
  });

  it("AC15: API field errors render next to the matching inputs", () => {
    render(
      <Harness
        errors={{
          date: "Дата вне диапазона 01.06–01.07.2026",
          price: "Цена должна быть больше нуля",
        }}
      />,
    );
    const date = screen.getByLabelText(/^Дата/);
    const price = screen.getByLabelText(/^Цена/);
    const dateMsg = screen.getByText("Дата вне диапазона 01.06–01.07.2026");
    const priceMsg = screen.getByText("Цена должна быть больше нуля");
    expect(dateMsg).toBeVisible();
    expect(priceMsg).toBeVisible();
    expect(dateMsg.parentElement).toContainElement(date);
    expect(priceMsg.parentElement).toContainElement(price);
  });

  it("AC19: submit is blocked while pending", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<Harness pending onSubmit={onSubmit} />);
    const button = screen.getByRole("button", { name: /Рассчитать|Считаем/ });
    expect(button).toBeDisabled();
    await user.click(button);
    await user.type(screen.getByLabelText(/^Цена/), "{Enter}");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("AC9: submitting sends origin, destination, date and price via api.forecast", async () => {
    vi.mocked(api.routes).mockResolvedValue(ROUTES);
    vi.mocked(api.forecast).mockResolvedValue(RESPONSE);
    const user = userEvent.setup();
    render(<ForecastPage onSessionExpired={() => {}} />);

    await user.click(await screen.findByRole("button", { name: "Рассчитать" }));

    await waitFor(() => expect(api.forecast).toHaveBeenCalledTimes(1));
    expect(api.forecast).toHaveBeenCalledWith({
      origin: "Москва",
      destination: "Сочи",
      date: "2026-06-01",
      price: 9000,
    });
  });

  it("AC9: a changed destination and price are what gets sent", async () => {
    vi.mocked(api.routes).mockResolvedValue(ROUTES);
    vi.mocked(api.forecast).mockResolvedValue(RESPONSE);
    const user = userEvent.setup();
    render(<ForecastPage onSessionExpired={() => {}} />);

    await user.selectOptions(await screen.findByLabelText(/^Куда/), "Санкт-Петербург");
    const price = screen.getByLabelText(/^Цена/);
    await user.clear(price);
    await user.type(price, "20000");
    await user.click(screen.getByRole("button", { name: "Рассчитать" }));

    await waitFor(() => expect(api.forecast).toHaveBeenCalledTimes(1));
    expect(api.forecast).toHaveBeenCalledWith(
      expect.objectContaining({
        origin: "Москва",
        destination: "Санкт-Петербург",
        price: 20000,
      }),
    );
  });

  it("AC19: a double submit sends one request while the first is pending", async () => {
    vi.mocked(api.routes).mockResolvedValue(ROUTES);
    let resolve: (r: ForecastResponse) => void = () => {};
    vi.mocked(api.forecast).mockReturnValue(
      new Promise<ForecastResponse>((r) => {
        resolve = r;
      }),
    );
    const user = userEvent.setup();
    render(<ForecastPage onSessionExpired={() => {}} />);

    const button = await screen.findByRole("button", { name: "Рассчитать" });
    await user.click(button);
    await user.click(screen.getByRole("button", { name: /Рассчитать|Считаем/ }));
    await user.keyboard("{Enter}");

    expect(api.forecast).toHaveBeenCalledTimes(1);
    resolve(RESPONSE);
    await waitFor(() => expect(screen.getByRole("button", { name: "Рассчитать" })).toBeEnabled());
  });

  it("AC15: a 422 from the API shows the field error next to the input", async () => {
    vi.mocked(api.routes).mockResolvedValue(ROUTES);
    vi.mocked(api.forecast).mockRejectedValue(
      new ApiError(422, "Проверьте введённые данные.", { date: "Дата вне диапазона" }),
    );
    const user = userEvent.setup();
    render(<ForecastPage onSessionExpired={() => {}} />);

    await user.click(await screen.findByRole("button", { name: "Рассчитать" }));

    const msg = await screen.findByText("Дата вне диапазона");
    expect(msg.parentElement).toContainElement(screen.getByLabelText(/^Дата/));
  });
});
