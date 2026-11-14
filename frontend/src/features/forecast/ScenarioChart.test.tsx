import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import pkgSource from "../../../package.json?raw";
import type { ForecastResponse } from "../../api/types";
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

const EMPTY: ForecastResponse = {
  ...RESULT,
  price: 20000,
  wants: 0,
  wants_raw: -3120,
  buys: 0,
  free_seats: 900,
  limit: "no_demand",
  scenarios: QUANTILES.map((quantile, i) => ({
    quantile,
    wants: 0,
    wants_raw: -3500 + i * 100,
    buys: 0,
    hits_seats: false,
  })),
};

function bars(container: HTMLElement): SVGElement[] {
  return Array.from(container.querySelectorAll<SVGElement>("svg [data-kind]"));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ScenarioChart", () => {
  it("AC12: renders one svg role img whose label mentions seats and median, the 10% caption and a 9-row scenario table", () => {
    const { container } = render(<ScenarioChart result={RESULT} />);

    const imgs = screen.getAllByRole("img");
    expect(imgs).toHaveLength(1);
    expect(imgs[0].tagName.toLowerCase()).toBe("svg");
    const label = imgs[0].getAttribute("aria-label") ?? "";
    expect(label).toMatch(/мест/i);
    expect(label).toMatch(/медиан/i);
    expect(container.querySelector("canvas")).toBeNull();

    expect(screen.getByText(/Между соседними столбиками/)).toHaveTextContent(/10\s?% вероятности/);

    const body = container.querySelectorAll("table tbody tr");
    expect(body).toHaveLength(9);
    const medianRow = body[4] as HTMLElement;
    expect(within(medianRow).getByText(/970/)).toBeInTheDocument();
    expect(within(medianRow).getByText(/900/)).toBeInTheDocument();
    expect(screen.queryByText(/спрос нулевой во всех девяти сценариях/i)).toBeNull();
  });

  it("AC12: nine bars; bars at or above seats are hits, others below; index 4 is marked median", () => {
    const { container } = render(<ScenarioChart result={RESULT} />);
    const all = bars(container);
    expect(all).toHaveLength(9);
    all.forEach((bar, i) => {
      expect(bar.getAttribute("data-kind")).toBe(WANTS[i] >= 900 ? "hits" : "below");
    });
    const medians = all.filter((b) => b.hasAttribute("data-median"));
    expect(medians).toHaveLength(1);
    expect(medians[0]).toBe(all[4]);
  });

  it("AC12: the value axis shows ticks from 0 and the dashed seats line is labelled with the seat count", () => {
    const { container } = render(<ScenarioChart result={RESULT} />);
    const svg = screen.getByRole("img");
    const texts = Array.from(svg.querySelectorAll("text")).map((t) => (t.textContent ?? "").trim());
    expect(texts).toContain("0");
    expect(texts.some((t) => /Мест:\s*900/.test(t))).toBe(true);
    const dashed = Array.from(container.querySelectorAll("svg line")).filter((l) =>
      l.getAttribute("stroke-dasharray"),
    );
    expect(dashed.length).toBeGreaterThan(0);
  });

  it("AC12: focusing the first bar button shows the demand readout; ArrowRight moves to the next bar and End to the last", async () => {
    const user = userEvent.setup();
    render(<ScenarioChart result={RESULT} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(9);
    expect(buttons[0]).toHaveAccessibleName(/желают 610, купят 610/);

    buttons[0].focus();
    expect(screen.getByText(/Желают:\s*610/)).toBeVisible();
    expect(screen.getByText(/Купят:\s*610/)).toBeVisible();

    await user.keyboard("{ArrowRight}");
    expect(buttons[1]).toHaveFocus();
    expect(screen.getByText(/Желают:\s*680/)).toBeVisible();

    await user.keyboard("{End}");
    expect(buttons[8]).toHaveFocus();
    expect(screen.getByText(/Желают:\s*1\s400/)).toBeVisible();
    expect(screen.getByText(/Купят:\s*900/)).toBeVisible();

    await user.keyboard("{Home}");
    expect(buttons[0]).toHaveFocus();
  });

  it("AC12: the bar buttons form a single tab stop", () => {
    render(<ScenarioChart result={RESULT} />);
    const stops = screen.getAllByRole("button").filter((b) => b.tabIndex === 0);
    expect(stops).toHaveLength(1);
  });

  it("AC12/AC10: for an all-negative scenario the readout shows the raw formula value and the empty overlay is visible", () => {
    render(<ScenarioChart result={EMPTY} />);
    expect(screen.getByText(/спрос нулевой во всех девяти сценариях/i)).toBeVisible();
    screen.getAllByRole("button")[0].focus();
    expect(screen.getByText(/Желают:\s*0\s*\(по формуле:\s*−3\s500\)/)).toBeVisible();
    expect(screen.getByText(/Купят:\s*0/)).toBeVisible();
  });

  it("AC12: the legend lists the encodings and the seat count", () => {
    render(<ScenarioChart result={RESULT} />);
    expect(screen.getByText(/Самолёт заполнен/)).toBeInTheDocument();
    expect(screen.getByText(/Ниже числа мест/)).toBeInTheDocument();
    expect(screen.getByText(/Медиана/)).toBeInTheDocument();
    expect(screen.getByText(/Мест в самолёте:\s*900/)).toBeInTheDocument();
  });

  it("AC12: the chart heading is level 2 with class text-lg", () => {
    render(<ScenarioChart result={RESULT} />);
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading).toHaveClass("text-lg");
  });

  it("AC12/AC18: package.json no longer lists chart.js", () => {
    const pkg = JSON.parse(pkgSource) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(pkg.dependencies ?? {}).not.toHaveProperty("chart.js");
    expect(pkg.devDependencies ?? {}).not.toHaveProperty("chart.js");
  });

  it("AC12/AC16: without IntersectionObserver the bars render at full height, nothing throws and the readout is not a live region", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const { container } = render(<ScenarioChart result={RESULT} />);
    const all = bars(container);
    expect(all).toHaveLength(9);
    for (const bar of all) {
      expect(Number(bar.getAttribute("height"))).toBeGreaterThan(0);
    }
    screen.getAllByRole("button")[0].focus();
    const readout = screen.getByText(/Желают:\s*610/);
    expect(readout.closest("[role=status], [aria-live]")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
