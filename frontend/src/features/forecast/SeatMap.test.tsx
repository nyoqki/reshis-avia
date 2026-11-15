import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ForecastResponse } from "../../api/types";
import { ScenarioChart } from "./ScenarioChart";
import { SeatMap } from "./SeatMap";

function setReduced(reduced: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("prefers-reduced-motion") ? reduced : false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const SHAPES = "path, rect, circle, line, polygon, polyline, ellipse, use";

/** The cabin is the first svg; the taken seats are the path that fades in. */
function cabin(container: HTMLElement) {
  const svg = container.querySelector("svg");
  const paths = Array.from(svg?.querySelectorAll("path") ?? []);
  return {
    filled: paths.find((p) => p.classList.contains("seatmap-filled")),
    free: paths.find((p) => !p.classList.contains("seatmap-filled")),
  };
}

const QUANTILES = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
const WANTS = [822, 868, 905, 929, 970, 1004, 1045, 1080, 1156];
const SOCHI: ForecastResponse = {
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
    price: 10039,
    corridor_low: 9514,
    corridor_high: 10815,
    corridor_pct: 13,
    risky: false,
  },
  history_id: 1,
};

describe("SeatMap", () => {
  it("TB-AC17: the measured figure can shrink below the svg it drew and the svg never overflows it", () => {
    // A grid item keeps min-width:auto, so without min-w-0 the figure stays as wide as its svg and
    // the ResizeObserver never reports a narrower board.
    const { container } = render(<SeatMap seats={270} buys={200} wants={250} />);
    expect(container.querySelector("figure")).toHaveClass("min-w-0");
    expect(container.querySelector("svg")).toHaveClass("block", "max-w-full");
  });

  it("TB-AC11: the graphics are aria-hidden, have no focusable descendants and at most 8 shapes for 1440 seats", () => {
    for (const wants of [1400, 1600]) {
      const { container, unmount } = render(<SeatMap seats={1440} buys={1440} wants={wants} />);
      const svgs = Array.from(container.querySelectorAll("svg"));
      expect(svgs.length).toBeGreaterThan(0);
      let shapes = 0;
      for (const svg of svgs) {
        expect(svg).toHaveAttribute("aria-hidden", "true");
        expect(svg).toHaveAttribute("focusable", "false");
        expect(svg.querySelectorAll("[tabindex], a, button, input")).toHaveLength(0);
        shapes += svg.querySelectorAll(SHAPES).length;
      }
      expect(shapes).toBeLessThanOrEqual(8);
      unmount();
    }
  });

  it("TB-AC11: the caption states taken and free seats with ru-RU numbers", () => {
    render(<SeatMap seats={1440} buys={1300} wants={1400} />);
    const caption = screen.getByText(/1\s300/);
    expect(caption.tagName).toBe("P");
    expect(caption.textContent).toMatch(/1\s440/);
    expect(caption.textContent).toMatch(/свободно\s+140/);
    expect(caption.textContent?.trim()).not.toBe("Купят");
    expect(caption.textContent?.trim()).not.toBe("Свободно");
  });

  it("TB-AC11: taken seats are a calm grey and free seats a quiet filled cell without an outline", () => {
    const { container } = render(<SeatMap seats={270} buys={200} wants={250} />);
    const { filled, free } = cabin(container);
    // yellow stays for the queue: a solid yellow cabin out-shouted the four numbers above it
    expect(filled).toHaveClass("fill-bar");
    expect(filled?.getAttribute("class")).not.toMatch(/fill-sign/);
    expect(free).toHaveClass("fill-flap-hi");
    expect(free?.getAttribute("class")).not.toMatch(/stroke-|fill-none/);
    expect(free).not.toHaveAttribute("stroke-width");
  });

  it("TB-AC11: overflow labels the queue in words, «Не хватит мест: 70», never as +N", () => {
    const { container } = render(<SeatMap seats={900} buys={900} wants={970} />);
    const label = screen.getByText("Не хватит мест: 70");
    expect(label).toBeVisible();
    // the number reaches a screen reader: it is not inside the aria-hidden graphics
    expect(label.closest("[aria-hidden='true']")).toBeNull();
    expect(container.textContent).not.toMatch(/\+\s*\d/);
    expect(screen.queryByText(/Без места/)).toBeNull();
  });

  it("TB-AC11: no overflow shows no queue, no hatch and no +N label", () => {
    const { container } = render(<SeatMap seats={900} buys={500} wants={600} />);
    expect(screen.queryByText(/Не хватит мест/)).toBeNull();
    expect(container.querySelector("pattern")).toBeNull();
    expect(container.textContent).not.toMatch(/\+/);
  });

  it("TB-AC11/TB-AC12: the queue is hatched exactly like the chart's «Не хватит мест» part of a bar", () => {
    const map = render(<SeatMap seats={900} buys={900} wants={970} />);
    const chart = render(<ScenarioChart result={SOCHI} />);

    const mapPattern = map.container.querySelector("pattern");
    const chartPattern = chart.container.querySelector("pattern");
    expect(mapPattern).not.toBeNull();
    expect(chartPattern).not.toBeNull();
    const shape = (p: Element | null) =>
      p?.outerHTML.replace(/ id="[^"]*"/, "").replace(/\s+/g, " ") ?? "";
    expect(shape(mapPattern)).toBe(shape(chartPattern));

    const queue = map.container.querySelector(`path[fill="url(#${mapPattern?.id})"]`);
    const bar = chart.container.querySelector(`rect[fill="url(#${chartPattern?.id})"]`);
    expect(queue).not.toBeNull();
    expect(bar).not.toBeNull();
    for (const el of [queue, bar]) {
      expect(el).toHaveClass("stroke-sign");
      expect(el).toHaveAttribute("stroke-width", "1.5");
    }
  });

  it("TB-AC16: under reduced motion the svg carries no animation class", () => {
    setReduced(false);
    const normal = render(<SeatMap seats={270} buys={200} wants={250} />);
    expect(normal.container.querySelector("svg")?.getAttribute("class") ?? "").toMatch(/anim/i);
    normal.unmount();

    setReduced(true);
    const { container } = render(<SeatMap seats={270} buys={200} wants={250} />);
    expect(container.querySelector("svg")?.getAttribute("class") ?? "").not.toMatch(/anim/i);
  });
});
