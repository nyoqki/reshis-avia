import { useEffect, useState } from "react";
import { FLAP_SETTLE_MS, FLAP_STAGGER_MS, FLAP_STEP_MS, useReducedMotion } from "../../lib/motion";

export const FLAP_DIGITS = "0123456789";
export const FLAP_LETTERS = "АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ0123456789";

export interface FlapSequenceOptions {
  /** Wait before the cells start flipping. */
  delayMs?: number;
  /** When the last cell settles, counted from delayMs. */
  durationMs?: number;
  /** Characters a cell cycles through before it settles. */
  alphabet?: string;
  /** false shows the target at once, as under reduced motion. */
  play?: boolean;
}

/**
 * Time (ms after start) at which each position shows its final character: one after another,
 * FLAP_STAGGER_MS apart, the last one at delayMs + durationMs. A long string still flips at least
 * one step before its first cell settles.
 */
function settleTimes(length: number, delayMs: number, durationMs: number): number[] {
  const spread = Math.max(0, length - 1) * FLAP_STAGGER_MS;
  const first = delayMs + Math.max(durationMs - spread, FLAP_STEP_MS);
  return Array.from({ length }, (_, i) => first + i * FLAP_STAGGER_MS);
}

/**
 * The string shown `elapsed` ms after start. An unsettled cell shows the character that lies as
 * many steps before its target in the alphabet as it has flips left, so it rolls forward onto the
 * target, like a real board. Whitespace never flips.
 */
function frameAt(
  target: string,
  elapsed: number,
  times: readonly number[],
  delayMs: number,
  alphabet: string,
): string {
  const now = Math.max(elapsed, delayMs);
  let out = "";
  for (let i = 0; i < target.length; i++) {
    const ch = target[i];
    if (/\s/.test(ch) || elapsed >= times[i] || alphabet.length === 0) {
      out += ch;
      continue;
    }
    const left = Math.ceil((times[i] - now) / FLAP_STEP_MS);
    const base = Math.max(alphabet.indexOf(ch), 0);
    const len = alphabet.length;
    out += alphabet[(((base - left) % len) + len) % len];
  }
  return out;
}

/**
 * The characters a row of flap cells shows right now, always target.length long. On mount and on
 * every new target the cells cycle through `alphabet` and settle one by one; under reduced motion
 * or with play=false the target is returned at once and no timer runs.
 */
export function useFlapSequence(target: string, options: FlapSequenceOptions = {}): string {
  const {
    delayMs = 0,
    durationMs = FLAP_SETTLE_MS,
    alphabet = FLAP_LETTERS,
    play = true,
  } = options;
  const reduced = useReducedMotion();
  const animate = play && !reduced && /\S/.test(target);
  const [tick, setTick] = useState({ target, step: 0 });
  // A new target starts at step 0 in the same render, before the effect restarts the timers.
  const step = tick.target === target ? tick.step : 0;

  useEffect(() => {
    if (!animate) return;
    const times = settleTimes(target.length, delayMs, durationMs);
    const lastStep = Math.ceil(Math.max(...times) / FLAP_STEP_MS);
    setTick((prev) => (prev.target === target && prev.step === 0 ? prev : { target, step: 0 }));
    let k = 0;
    let id: ReturnType<typeof setTimeout>;
    const advance = () => {
      k += 1;
      setTick({ target, step: k });
      if (k < lastStep) id = setTimeout(advance, FLAP_STEP_MS);
    };
    id = setTimeout(advance, FLAP_STEP_MS);
    return () => clearTimeout(id);
  }, [target, animate, delayMs, durationMs]);

  if (!animate) return target;
  const times = settleTimes(target.length, delayMs, durationMs);
  return frameAt(target, step * FLAP_STEP_MS, times, delayMs, alphabet);
}
