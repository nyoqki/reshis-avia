import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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

describe("SeatMap", () => {
  it("AC11: the svg is aria-hidden, has no focusable descendants and at most 8 shapes for 1440 seats", () => {
    const { container } = render(<SeatMap seats={1440} buys={1300} wants={1400} />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("focusable", "false");
    expect(svg?.querySelectorAll("[tabindex], a, button, input")).toHaveLength(0);
    expect(svg?.querySelectorAll(SHAPES).length).toBeLessThanOrEqual(8);
  });

  it("AC11: the caption states taken and free seats with ru-RU numbers", () => {
    render(<SeatMap seats={1440} buys={1300} wants={1400} />);
    const caption = screen.getByText(/1\s300/);
    expect(caption.tagName).toBe("P");
    expect(caption.textContent).toMatch(/1\s440/);
    expect(caption.textContent).toMatch(/свободно\s+140/);
    expect(caption.textContent?.trim()).not.toBe("Купят");
    expect(caption.textContent?.trim()).not.toBe("Свободно");
  });

  it("AC11: overflow shows the queue count and +N when it exceeds QUEUE_MAX", () => {
    const { container } = render(<SeatMap seats={900} buys={900} wants={970} />);
    expect(screen.getByText(/Без места остаются:\s*70/)).toBeInTheDocument();
    expect(container.querySelector("svg")?.textContent).toMatch(/\+\s*58/);
  });

  it("AC11: no overflow shows no queue sentence and no +N label", () => {
    const { container } = render(<SeatMap seats={900} buys={500} wants={600} />);
    expect(screen.queryByText(/Без места/)).toBeNull();
    expect(container.querySelector("svg")?.textContent).not.toMatch(/\+/);
  });

  it("AC16: under reduced motion the svg carries no animation class", () => {
    setReduced(false);
    const normal = render(<SeatMap seats={270} buys={200} wants={250} />);
    expect(normal.container.querySelector("svg")?.getAttribute("class") ?? "").toMatch(/anim/i);
    normal.unmount();

    setReduced(true);
    const { container } = render(<SeatMap seats={270} buys={200} wants={250} />);
    expect(container.querySelector("svg")?.getAttribute("class") ?? "").not.toMatch(/anim/i);
  });
});
