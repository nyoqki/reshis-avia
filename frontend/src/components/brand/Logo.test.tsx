import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetOnceForTests } from "../../lib/once";
import { Logo } from "./Logo";
import logoSource from "./Logo.tsx?raw";

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
  it("AC7: the logo is an img named «Решись Авиа» and renders six tiles", () => {
    const { container } = render(<Logo />);
    expect(screen.getByRole("img", { name: "Решись Авиа" })).toBeTruthy();
    const tiles = Array.from(container.querySelectorAll("[data-tile]")).map((t) =>
      t.getAttribute("data-tile"),
    );
    expect(tiles).toEqual(["0", "1", "2", "3", "4", "5"]);
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("AC7: the first Logo mount of a size has data-intro=true, a second mount of the same size has data-intro=false", () => {
    const first = render(<Logo size="header" />);
    expect(intro(first.container)).toBe("true");
    const second = render(<Logo size="header" />);
    expect(intro(second.container)).toBe("false");
  });

  it("AC7: intro={false} never plays the intro", () => {
    const { container } = render(<Logo intro={false} />);
    expect(intro(container)).toBe("false");
  });

  it("AC7/AC16: under reduced motion the first mount has data-intro=false", () => {
    mockReduced(true);
    const { container } = render(<Logo />);
    expect(intro(container)).toBe("false");
  });

  it("AC7: the «Авиа» part uses currentColor so it follows the theme", () => {
    const { container } = render(<Logo />);
    const word = container.querySelector('[data-part="word"]');
    expect(word).not.toBeNull();
    expect(word?.getAttribute("fill")).toBe("currentColor");
  });

  it("AC7: a hero mount followed by a header mount gives the header data-intro=true", () => {
    const hero = render(<Logo size="hero" />);
    expect(intro(hero.container)).toBe("true");
    const header = render(<Logo size="header" />);
    expect(intro(header.container)).toBe("true");
  });

  it("AC2: tile and letter shapes use fill-sign / fill-sign-ink classes and the source has no colour literal", () => {
    const { container } = render(<Logo />);
    const tileShapes = container.querySelectorAll('[data-part="tile"]');
    const letterShapes = container.querySelectorAll('[data-part="letter"]');
    expect(tileShapes.length).toBeGreaterThanOrEqual(6);
    expect(letterShapes.length).toBeGreaterThanOrEqual(6);
    for (const el of tileShapes) expect(el.getAttribute("class")).toContain("fill-sign");
    for (const el of letterShapes) expect(el.getAttribute("class")).toContain("fill-sign-ink");
    expect(logoSource).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|oklch\(|oklab\(/);
  });
});
