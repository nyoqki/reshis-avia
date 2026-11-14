import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatInt } from "../../lib/format";
import { FLAP_SETTLE_MS, FLAP_STAGGER_MS } from "../../lib/motion";
import boardCss from "../../styles/board.css?raw";
import { Board } from "./Board";
import { FlapNumber } from "./FlapNumber";
import { FlapText } from "./FlapText";

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

function cells(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>("[data-char]"));
}
const chars = (container: HTMLElement) => cells(container).map((c) => c.dataset.char);
const settle = () => FLAP_SETTLE_MS + FLAP_STAGGER_MS * 20 + 500;

describe("FlapNumber", () => {
  it("AC10: 1440 has text content «1 440» (NBSP) and an aria-hidden cell layer without text nodes", () => {
    const { container } = render(<FlapNumber value={1440} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.textContent).toBe(formatInt(1440));
    expect(root.textContent).toBe("1\u00a0440");
    const list = cells(container);
    expect(list).toHaveLength(4);
    const layer = list[0].closest("[aria-hidden='true']") as HTMLElement;
    expect(layer).not.toBeNull();
    expect(layer.textContent).toBe("");
    for (const c of list) expect(c.textContent).toBe("");
  });

  it("AC10: 28 with minCells 3 renders three digit cells, the first blank", () => {
    vi.useFakeTimers();
    const { container } = render(<FlapNumber value={28} minCells={3} play={false} />);
    const list = cells(container);
    expect(list).toHaveLength(3);
    expect(list[0].dataset.char?.trim()).toBe("");
    expect(list[1].dataset.char).toBe("2");
    expect(list[2].dataset.char).toBe("8");
  });

  it("AC10: with motion, cells show intermediate characters after mount and settle on the target; text is final throughout", () => {
    const { container } = render(<FlapNumber value={1440} />);
    const root = container.firstElementChild as HTMLElement;
    expect(cells(container)).toHaveLength(4);
    for (const c of chars(container)) expect(c).toMatch(/^[0-9]$/);
    let sawIntermediate = false;
    for (let t = 0; t < settle(); t += 20) {
      act(() => {
        vi.advanceTimersByTime(20);
      });
      expect(root.textContent).toBe("1\u00a0440");
      if (chars(container).join("") !== "1440") sawIntermediate = true;
    }
    expect(sawIntermediate).toBe(true);
    expect(chars(container)).toEqual(["1", "4", "4", "0"]);
  });

  it("AC16: under reduced motion the cells show the final characters on the first render and no timer is scheduled", () => {
    mockReduced(true);
    const spy = vi.spyOn(globalThis, "setTimeout");
    const { container } = render(<FlapNumber value={1440} />);
    expect(chars(container)).toEqual(["1", "4", "4", "0"]);
    expect(spy).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    spy.mockRestore();
  });

  it("AC10: a changed value restarts the sequence and ends on the new value", () => {
    const { container, rerender } = render(<FlapNumber value={1440} />);
    act(() => {
      vi.advanceTimersByTime(settle());
    });
    expect(chars(container)).toEqual(["1", "4", "4", "0"]);
    rerender(<FlapNumber value={905} />);
    expect(cells(container)).toHaveLength(3);
    act(() => {
      vi.advanceTimersByTime(FLAP_STAGGER_MS);
    });
    expect((container.firstElementChild as HTMLElement).textContent).toBe("905");
    act(() => {
      vi.advanceTimersByTime(settle());
    });
    expect(chars(container)).toEqual(["9", "0", "5"]);
  });
});

describe("FlapText", () => {
  it("AC10: text content equals srText while the cells show «МЕСТ НЕТ»", () => {
    const { container } = render(<FlapText text="МЕСТ НЕТ" srText="Мест нет" play={false} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.textContent).toBe("Мест нет");
    expect(chars(container).join("")).toBe("МЕСТ НЕТ");
    const layer = cells(container)[0].closest("[aria-hidden='true']") as HTMLElement;
    expect(layer).not.toBeNull();
    expect(layer.textContent).toBe("");
  });

  it("AC10: pads with blank cells at the start up to minCells", () => {
    const { container } = render(<FlapText text="ДА" minCells={5} play={false} />);
    const list = chars(container);
    expect(list).toHaveLength(5);
    expect(list.slice(0, 3).every((c) => (c ?? "").trim() === "")).toBe(true);
    expect(list.slice(3)).toEqual(["Д", "А"]);
  });

  it("AC10: a changed target restarts the sequence and ends on the new value", () => {
    const { container, rerender } = render(<FlapText text="МЕСТ НЕТ" />);
    act(() => {
      vi.advanceTimersByTime(settle());
    });
    expect(chars(container).join("")).toBe("МЕСТ НЕТ");
    rerender(<FlapText text="ЕСТЬ" />);
    expect((container.firstElementChild as HTMLElement).textContent).toBe("ЕСТЬ");
    act(() => {
      vi.advanceTimersByTime(settle());
    });
    expect(chars(container).join("")).toBe("ЕСТЬ");
  });

  it("AC16: under reduced motion the cells show the final characters at once", () => {
    mockReduced(true);
    const { container } = render(<FlapText text="МЕСТ НЕТ" />);
    expect(chars(container).join("")).toBe("МЕСТ НЕТ");
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("Board", () => {
  it("AC5: renders the requested element with its header row", () => {
    const { container } = render(
      <Board as="article" header={<h2>Заголовок</h2>}>
        <p>Тело</p>
      </Board>,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.tagName).toBe("ARTICLE");
    expect(root).toHaveTextContent("Заголовок");
    expect(root).toHaveTextContent("Тело");
    const heading = root.querySelector("h2") as HTMLElement;
    expect(heading.compareDocumentPosition(root.querySelector("p") as HTMLElement)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("AC5: defaults to a section", () => {
    const { container } = render(<Board>x</Board>);
    expect((container.firstElementChild as HTMLElement).tagName).toBe("SECTION");
  });

  it("AC3: the root has class board and board.css maps --color-focus to --color-board-focus for it", () => {
    const { container } = render(<Board className="extra">x</Board>);
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveClass("board");
    expect(root).toHaveClass("extra");
    expect(boardCss).toMatch(
      /\.board\s*\{[^}]*--color-focus:\s*var\(--color-board-focus\)\s*;?[^}]*\}/,
    );
  });
});
