import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetOnceForTests } from "../../lib/once";
import { Logo } from "./Logo";
import logoSource from "./Logo.tsx?raw";
import logoCss from "./logo.css?raw";

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
  resetOnceForTests();
  mockReduced(false);
});

afterEach(() => {
  cleanup();
  Object.defineProperty(window, "matchMedia", { writable: true, value: original });
});

const intro = (c: HTMLElement) => c.querySelector("[data-intro]")?.getAttribute("data-intro");

describe("Logo", () => {
  it("TB-AC7: the logo is an img named «Решись Авиа» and renders six tiles", () => {
    const { container } = render(<Logo />);
    expect(screen.getByRole("img", { name: "Решись Авиа" })).toBeTruthy();
    const tiles = Array.from(container.querySelectorAll("[data-tile]")).map((t) =>
      t.getAttribute("data-tile"),
    );
    expect(tiles).toEqual(["0", "1", "2", "3", "4", "5"]);
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("TB-AC7: the first Logo mount of a size has data-intro=true, a second mount of the same size has data-intro=false", () => {
    const first = render(<Logo size="header" />);
    expect(intro(first.container)).toBe("true");
    const second = render(<Logo size="header" />);
    expect(intro(second.container)).toBe("false");
  });

  it("TB-AC7: intro={false} never plays the intro", () => {
    const { container } = render(<Logo intro={false} />);
    expect(intro(container)).toBe("false");
  });

  it("TB-AC7/TB-AC16: under reduced motion the first mount has data-intro=false", () => {
    mockReduced(true);
    const { container } = render(<Logo />);
    expect(intro(container)).toBe("false");
  });

  it("TB-AC7: the «Авиа» part uses currentColor so it follows the theme", () => {
    const { container } = render(<Logo />);
    const word = container.querySelector('[data-part="word"]');
    expect(word).not.toBeNull();
    expect(word?.getAttribute("fill")).toBe("currentColor");
  });

  it("TB-AC7: a hero mount followed by a header mount gives the header data-intro=true", () => {
    const hero = render(<Logo size="hero" />);
    expect(intro(hero.container)).toBe("true");
    const header = render(<Logo size="header" />);
    expect(intro(header.container)).toBe("true");
  });

  it("TB-AC2: tile and letter shapes use fill-sign / fill-sign-ink classes and the source has no colour literal", () => {
    const { container } = render(<Logo />);
    const tileShapes = container.querySelectorAll('[data-part="tile"]');
    const letterShapes = container.querySelectorAll('[data-part="letter"]');
    expect(tileShapes.length).toBeGreaterThanOrEqual(6);
    expect(letterShapes.length).toBeGreaterThanOrEqual(6);
    for (const el of tileShapes) expect(el.getAttribute("class")).toContain("fill-sign");
    for (const el of letterShapes) expect(el.getAttribute("class")).toContain("fill-sign-ink");
    expect(logoSource).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|oklch\(|oklab\(/);
  });
  it("TB-AC7: each tile is split at the hinge into an upper and a lower half, each clipped by a clipPath of the svg", () => {
    const { container } = render(<Logo size="hero" />);
    const svg = container.querySelector("svg") as SVGSVGElement;
    const tiles = Array.from(container.querySelectorAll("[data-tile]"));
    expect(tiles).toHaveLength(6);
    for (const tile of tiles) {
      const halves = Array.from(tile.children).map((h) => h.getAttribute("data-half"));
      expect(halves).toEqual(["top", "bottom"]);
    }
    const clip = (half: string) => {
      const ref = tiles[0].querySelector(`[data-half="${half}"]`)?.getAttribute("clip-path") ?? "";
      const id = ref.match(/^url\(#(.+)\)$/)?.[1] ?? "";
      const path = svg.querySelector(`[id="${id}"]`);
      expect(path?.localName, half).toBe("clipPath");
      const rect = path?.querySelector("rect");
      return { y: Number(rect?.getAttribute("y")), h: Number(rect?.getAttribute("height")) };
    };
    // hero tiles are 100 units tall with the hinge band at 49.3–50.7: the halves meet on it
    const top = clip("top");
    const bottom = clip("bottom");
    expect(top.y).toBe(0);
    expect(top.y + top.h).toBeGreaterThanOrEqual(49.3);
    expect(top.y + top.h).toBeLessThanOrEqual(50.7);
    expect(bottom.y).toBeGreaterThanOrEqual(49.3);
    expect(bottom.y).toBeLessThanOrEqual(50.7);
    expect(bottom.y + bottom.h).toBeGreaterThanOrEqual(100);
  });

  it("TB-AC7/TB-AC10: in the intro only the lower half moves: the upper half shows at once, the lower falls from the hinge", () => {
    const block = (selector: string) => {
      const at = logoCss.indexOf(`${selector} {`);
      expect(at, selector).toBeGreaterThanOrEqual(0);
      return logoCss.slice(at, logoCss.indexOf("}", at));
    };
    expect(block('.logo[data-intro="true"] .logo-half-top')).toMatch(
      /animation:\s*logo-show\s+var\(--duration-flap\)\s+step-start/,
    );
    const bottom = block('.logo[data-intro="true"] .logo-half-bottom');
    expect(bottom).toMatch(/animation:\s*logo-fall\s/);
    expect(bottom).toMatch(/transform-box:\s*view-box/);
    expect(bottom).toMatch(/transform-origin:\s*0 var\(--logo-hinge\)/);
    expect(logoCss).toMatch(
      /@keyframes logo-fall\s*\{\s*from\s*\{\s*transform:\s*scaleY\(0\);\s*\}\s*to\s*\{\s*transform:\s*scaleY\(1\);\s*\}/,
    );
    expect(logoCss).toMatch(
      /@keyframes logo-show\s*\{\s*from\s*\{\s*opacity:\s*0;\s*\}\s*to\s*\{\s*opacity:\s*1;\s*\}/,
    );
    // the whole tile no longer turns
    expect(logoCss).not.toMatch(/\.logo-tile\s*\{[^}]*animation/);
    // the hinge in viewBox units: header tiles are 32 tall, hero tiles 100
    expect(block('.logo[data-size="header"]')).toMatch(/--logo-hinge:\s*16px/);
    expect(block('.logo[data-size="hero"]')).toMatch(/--logo-hinge:\s*50px/);
  });
});
