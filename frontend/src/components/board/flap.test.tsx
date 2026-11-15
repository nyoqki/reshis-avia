import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatInt } from "../../lib/format";
import { FLAP_SETTLE_MS, FLAP_STAGGER_MS } from "../../lib/motion";
import boardCss from "../../styles/board.css?raw";
import { Board } from "./Board";
import { FlapCell } from "./FlapCell";
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
  it("TB-AC10: 1440 has text content «1 440» (NBSP) and an aria-hidden cell layer without text nodes", () => {
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

  it("TB-AC10: 28 with minCells 3 renders three digit cells, the first blank", () => {
    vi.useFakeTimers();
    const { container } = render(<FlapNumber value={28} minCells={3} play={false} />);
    const list = cells(container);
    expect(list).toHaveLength(3);
    expect(list[0].dataset.char?.trim()).toBe("");
    expect(list[1].dataset.char).toBe("2");
    expect(list[2].dataset.char).toBe("8");
  });

  it("TB-AC10: with motion, cells show intermediate characters after mount and settle on the target; text is final throughout", () => {
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

  it("TB-AC16: under reduced motion the cells show the final characters on the first render and no timer is scheduled", () => {
    mockReduced(true);
    const spy = vi.spyOn(globalThis, "setTimeout");
    const { container } = render(<FlapNumber value={1440} />);
    expect(chars(container)).toEqual(["1", "4", "4", "0"]);
    expect(spy).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    spy.mockRestore();
  });

  it("TB-AC10: a changed value restarts the sequence and ends on the new value", () => {
    const { container, rerender } = render(<FlapNumber value={1440} />);
    act(() => {
      vi.advanceTimersByTime(settle());
    });
    expect(chars(container)).toEqual(["1", "4", "4", "0"]);
    rerender(<FlapNumber value={905} />);
    expect(cells(container)).toHaveLength(3);
    // a snap to the new value would never show anything but «905» in the cells
    let sawIntermediate = chars(container).join("") !== "905";
    for (let t = 0; t < settle(); t += 20) {
      act(() => {
        vi.advanceTimersByTime(20);
      });
      expect((container.firstElementChild as HTMLElement).textContent).toBe("905");
      if (chars(container).join("") !== "905") sawIntermediate = true;
    }
    expect(sawIntermediate).toBe(true);
    expect(chars(container)).toEqual(["9", "0", "5"]);
  });
});

describe("FlapText", () => {
  it("TB-AC10: text content equals srText while the cells show «МЕСТ НЕТ»", () => {
    const { container } = render(<FlapText text="МЕСТ НЕТ" srText="Мест нет" play={false} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.textContent).toBe("Мест нет");
    expect(chars(container).join("")).toBe("МЕСТ НЕТ");
    const layer = cells(container)[0].closest("[aria-hidden='true']") as HTMLElement;
    expect(layer).not.toBeNull();
    expect(layer.textContent).toBe("");
  });

  it("TB-AC10: pads with blank cells at the start up to minCells", () => {
    const { container } = render(<FlapText text="ДА" minCells={5} play={false} />);
    const list = chars(container);
    expect(list).toHaveLength(5);
    expect(list.slice(0, 3).every((c) => (c ?? "").trim() === "")).toBe(true);
    expect(list.slice(3)).toEqual(["Д", "А"]);
  });

  it("TB-AC10: a changed target restarts the sequence and ends on the new value", () => {
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

  it("TB-AC16: under reduced motion the cells show the final characters at once", () => {
    mockReduced(true);
    const { container } = render(<FlapText text="МЕСТ НЕТ" />);
    expect(chars(container).join("")).toBe("МЕСТ НЕТ");
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("Board", () => {
  it("TB-AC5: renders the requested element with its header row", () => {
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

  it("TB-AC5: defaults to a section", () => {
    const { container } = render(<Board>x</Board>);
    expect((container.firstElementChild as HTMLElement).tagName).toBe("SECTION");
  });

  it("TB-AC3: the root has class board and board.css maps --color-focus to --color-board-focus for it", () => {
    const { container } = render(<Board className="extra">x</Board>);
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveClass("board");
    expect(root).toHaveClass("extra");
    expect(boardCss).toMatch(
      /\.board\s*\{[^}]*--color-focus:\s*var\(--color-board-focus\)\s*;?[^}]*\}/,
    );
  });
});

describe("FlapCell", () => {
  it("TB-AC10: a new character drops a new lower leaf onto the old one, and the upper half shows it at once", () => {
    const { container, rerender } = render(<FlapCell char="А" />);
    const cell = container.firstElementChild as HTMLElement;
    expect(cell.dataset.char).toBe("А");
    expect(cell.dataset.prev).toBe("А");
    expect(cell.querySelector(".flap-leaf")).toBeNull();

    rerender(<FlapCell char="Б" />);
    expect(cell.dataset.char).toBe("Б");
    expect(cell.dataset.prev).toBe("А");
    const first = cell.querySelectorAll<HTMLElement>(".flap-leaf");
    expect(first).toHaveLength(1);
    expect(first[0].dataset.glyph).toBe("Б");
    // the leaf is not a cell of its own and carries no text node
    expect(first[0].hasAttribute("data-char")).toBe(false);
    expect(cell.textContent).toBe("");

    rerender(<FlapCell char="В" />);
    expect(cell.dataset.prev).toBe("Б");
    const second = cell.querySelectorAll<HTMLElement>(".flap-leaf");
    expect(second).toHaveLength(1);
    expect(second[0].dataset.glyph).toBe("В");
    // a fresh element per change restarts the fall
    expect(second[0]).not.toBe(first[0]);
  });

  it("TB-AC10: the same character again drops no new leaf", () => {
    const { container, rerender } = render(<FlapCell char="А" />);
    rerender(<FlapCell char="Б" />);
    const leaf = container.querySelector(".flap-leaf");
    rerender(<FlapCell char="Б" />);
    expect(container.querySelector(".flap-leaf")).toBe(leaf);
  });
});

describe("board.css flap motion", () => {
  // the bodies of every rule whose selector list names `selector` (comments dropped first)
  const rule = (selector: string) => {
    const css = boardCss.replace(/\/\*[\s\S]*?\*\//g, "");
    const body = Array.from(css.matchAll(/([^{}]+)\{([^{}]*)\}/g))
      .filter((m) => m[1].split(",").some((s) => s.trim() === selector))
      .map((m) => m[2])
      .join("\n");
    expect(body, selector).not.toBe("");
    return body;
  };
  const keyframes = (name: string) => {
    const m = boardCss.match(new RegExp(`@keyframes ${name}\\s*\\{([\\s\\S]*?)\\n\\}`));
    expect(m, name).not.toBeNull();
    return m?.[1] ?? "";
  };

  it("TB-AC10: the upper leaf never moves", () => {
    expect(rule(".flap-cell::before")).not.toMatch(/animation|transform/);
    expect(boardCss).not.toMatch(/::before[^{]*\{[^}]*animation/);
  });

  it("TB-AC10: only the lower leaf moves: it falls from the hinge, edge-on to flat, in one step", () => {
    const leaf = rule(".flap-leaf");
    expect(leaf).toMatch(/animation:\s*flap-fall\s+var\(--duration-step\)/);
    expect(leaf).toMatch(/transform-origin:\s*50% 50%/);
    expect(leaf).toMatch(/clip-path:\s*inset\(calc\(50% \+ var\(--flap-hinge\)\) 0 0 0\)/);
    const fall = keyframes("flap-fall");
    expect(fall).toMatch(/from\s*\{[^}]*rotateX\(90deg\)/);
    expect(fall).toMatch(/to\s*\{[^}]*rotateX\(0deg\)/);
  });

  it("TB-AC10: the lower leaf under the falling one keeps the previous character", () => {
    expect(rule(".flap-cell::after")).toMatch(/content:\s*attr\(data-prev\)/);
    expect(rule(".flap-leaf::before")).toMatch(/content:\s*attr\(data-glyph\)/);
  });

  it("TB-AC16: reduced motion stops the falling leaf", () => {
    const reduced = boardCss.slice(boardCss.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toMatch(/\.flap-leaf[^{]*\{[^}]*animation:\s*none/);
  });

  it("TB-AC10: a row comes in without turning: its entrance animates opacity only", () => {
    const name = rule("[data-row-flip]").match(/animation:\s*([\w-]+)/)?.[1] ?? "";
    expect(name).not.toBe("");
    expect(keyframes(name)).not.toMatch(/rotate|transform/);
  });
});
