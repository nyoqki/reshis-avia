import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeparturesBoard } from "./DeparturesBoard";
import { DEPARTURES } from "./departures";

const original = window.matchMedia;

function mockReduced(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  mockReduced(false);
});

afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(window, "matchMedia", { writable: true, value: original });
});

const dataRows = () => screen.getAllByRole("row").slice(1);
const nbsp = (s: string) => s.replace(/\s/g, " ");

describe("DeparturesBoard", () => {
  it("TB-AC8: the board shows five data rows with city, code and price in CSV order and the period", () => {
    render(<DeparturesBoard />);
    const rows = dataRows();
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => within(r).getAllByRole("cell").length)).toEqual([2, 2, 2, 2, 2]);
    DEPARTURES.forEach((d, i) => {
      expect(within(rows[i]).getByRole("rowheader").textContent).toBe(d.city);
      const cells = within(rows[i]).getAllByRole("cell");
      expect(cells[0].textContent).toBe(d.code);
      expect(nbsp(cells[1].textContent ?? "")).toBe(
        new Intl.NumberFormat("ru-RU").format(d.basePrice).replace(/\s/g, " "),
      );
    });
    expect(within(rows[0]).getByRole("rowheader")).toHaveTextContent("Сочи");
    expect(nbsp(within(rows[0]).getAllByRole("cell")[1].textContent ?? "")).toBe("9 000");
    expect(screen.getByText("Прогноз на 01.06–01.07.2026")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2 })).toBeInTheDocument();
  });

  it("TB-AC8: the column headers are Куда, Код, Базовая цена, ₽ and there are no flight-number, time or status columns", () => {
    render(<DeparturesBoard />);
    const heads = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(heads).toEqual(["Куда", "Код", "Базовая цена, ₽"]);
    expect(screen.queryByText(/рейс|время|статус|вылет/i, { selector: "th" })).toBeNull();
  });

  it("TB-AC8/TB-AC10: each cell's text content is the final value while the flap layer is aria-hidden", () => {
    const { container } = render(<DeparturesBoard />);
    // mid-animation: text content must already be final
    expect(dataRows()[0].textContent).toContain("AER");
    const layers = container.querySelectorAll(".flap-row");
    expect(layers).toHaveLength(10);
    for (const layer of layers) {
      expect(layer.getAttribute("aria-hidden")).toBe("true");
      expect(layer.textContent).toBe("");
    }
    for (const row of dataRows()) {
      const cells = within(row).getAllByRole("cell");
      expect(cells[0].textContent).toMatch(/^[A-Z]{3}$/);
      expect(cells[1].textContent).toMatch(/^\d{1,2}\s\d{3}$/);
    }
  });

  it("TB-AC16: under reduced motion no timer is scheduled and cells show final characters", () => {
    mockReduced(true);
    const spy = vi.spyOn(globalThis, "setTimeout");
    const { container } = render(<DeparturesBoard />);
    expect(spy).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    const chars = (row: HTMLElement, i: number) =>
      Array.from(within(row).getAllByRole("cell")[i].querySelectorAll("[data-char]")).map(
        (c) => (c as HTMLElement).dataset.char,
      );
    expect(chars(dataRows()[0], 0)).toEqual(["A", "E", "R"]);
    expect(chars(dataRows()[0], 1)).toEqual(["9", "0", "0", "0"]);
    expect(container.querySelector(".flap-cell--flipping")).toBeNull();
    spy.mockRestore();
  });

  it("TB-AC17: city cells contain no flap cells and the code and price cells use the 'fit' flap size", () => {
    render(<DeparturesBoard />);
    for (const row of dataRows()) {
      expect(row.querySelector("th[scope=row] [data-char]")).toBeNull();
      const cells = within(row).getAllByRole("cell");
      for (const cell of cells) {
        const flaps = cell.querySelectorAll(".flap-cell");
        expect(flaps.length).toBeGreaterThan(0);
        for (const f of flaps) expect(f.classList.contains("flap-fit")).toBe(true);
      }
    }
  });
});
