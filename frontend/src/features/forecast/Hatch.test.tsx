import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HatchPattern } from "./Hatch";
import hatchCss from "./hatch.css?raw";

describe("Hatch", () => {
  it("TB-AC12: the legend swatch repeats with the same period and stripe width as the SVG pattern", () => {
    const { container } = render(
      <svg aria-hidden="true">
        <defs>
          <HatchPattern id="h" />
        </defs>
      </svg>,
    );
    const pattern = container.querySelector("pattern") as SVGPatternElement;
    const period = Number(pattern.getAttribute("width"));
    const stripe = Number(pattern.querySelector("rect.fill-sign")?.getAttribute("width"));
    const m = hatchCss.match(
      /var\(--color-sign\)\s+0\s+(\d+)px,\s*var\(--color-board\)\s+(\d+)px\s+(\d+)px/,
    );
    expect(m).not.toBeNull();
    const [, sign, boardStart, end] = (m ?? []).map(Number);
    expect(sign).toBe(stripe);
    expect(boardStart).toBe(stripe);
    expect(end).toBe(period);
  });
});
