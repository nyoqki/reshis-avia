import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FLAP_SETTLE_MS,
  FLAP_STAGGER_MS,
  FLAP_STEP_MS,
  prefersReducedMotion,
  useReducedMotion,
} from "./motion";

const original = window.matchMedia;

afterEach(() => {
  Object.defineProperty(window, "matchMedia", { writable: true, value: original });
});

function mockMedia(matches: boolean) {
  const listeners = new Set<(e: { matches: boolean }) => void>();
  const mql = {
    matches,
    media: "(prefers-reduced-motion: reduce)",
    addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: (e: { matches: boolean }) => void) => listeners.delete(cb),
    addListener: (cb: (e: { matches: boolean }) => void) => listeners.add(cb),
    removeListener: (cb: (e: { matches: boolean }) => void) => listeners.delete(cb),
    dispatchEvent: () => false,
  };
  Object.defineProperty(window, "matchMedia", { writable: true, value: vi.fn(() => mql) });
  return {
    fire(next: boolean) {
      mql.matches = next;
      for (const cb of [...listeners]) cb({ matches: next });
    },
  };
}

describe("motion constants", () => {
  it("mirror the CSS tokens", () => {
    expect(FLAP_STEP_MS).toBe(60);
    expect(FLAP_STAGGER_MS).toBe(45);
    expect(FLAP_SETTLE_MS).toBe(1000);
  });
});

describe("prefersReducedMotion", () => {
  it("AC16: reflects the media query", () => {
    mockMedia(true);
    expect(prefersReducedMotion()).toBe(true);
    mockMedia(false);
    expect(prefersReducedMotion()).toBe(false);
  });

  it("AC16: is false without matchMedia", () => {
    Object.defineProperty(window, "matchMedia", { writable: true, value: undefined });
    expect(prefersReducedMotion()).toBe(false);
  });
});

describe("useReducedMotion", () => {
  it("AC16: updates when the media query fires change", () => {
    const media = mockMedia(false);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
    act(() => media.fire(true));
    expect(result.current).toBe(true);
    act(() => media.fire(false));
    expect(result.current).toBe(false);
  });
});
