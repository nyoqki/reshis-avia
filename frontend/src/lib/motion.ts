import { useSyncExternalStore } from "react";

/** One flip of a cell while it cycles through the alphabet; mirrors --duration-step. */
export const FLAP_STEP_MS = 60;
/** Delay between neighbouring cells settling; mirrors --stagger-flap. */
export const FLAP_STAGGER_MS = 45;
/** How long a flap sequence takes to settle; mirrors --duration-settle. */
export const FLAP_SETTLE_MS = 1000;

const QUERY = "(prefers-reduced-motion: reduce)";

function mediaQuery(): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return null;
  return window.matchMedia(QUERY);
}

/** True when the OS asks for reduced motion; false when matchMedia is unavailable. */
export function prefersReducedMotion(): boolean {
  return mediaQuery()?.matches ?? false;
}

function subscribe(onChange: () => void): () => void {
  const mql = mediaQuery();
  if (!mql) return () => {};
  if (typeof mql.addEventListener === "function") {
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }
  // Safari before 14 only has the deprecated listener API.
  mql.addListener(onChange);
  return () => mql.removeListener(onChange);
}

/** prefersReducedMotion() as React state, updated when the media query changes. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, prefersReducedMotion, () => false);
}
