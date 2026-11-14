import type { SelloutBand } from "../api/types";

const NBSP = " ";

const intFormat = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const dateFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** Integer with ru-RU grouping; the group separator is always a NBSP. */
export function formatInt(n: number): string {
  return intFormat.format(n).replace(/[   ]/g, NBSP);
}

export function formatRub(n: number): string {
  return `${formatInt(n)}${NBSP}₽`;
}

/** A price range with one ruble sign: `5 400–18 000 ₽`. */
export function formatRubRange(min: number, max: number): string {
  return `${formatInt(min)}–${formatRub(max)}`;
}

/** A signed integer with a real minus sign (U+2212): the raw demand under a card that shows 0. */
export function formatSigned(n: number): string {
  return formatInt(n).replace("-", "−");
}

/** ISO date (`2026-06-12`) -> `12 июня 2026`. */
export function formatDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return dateFormat.format(d).replace(/\s?г\.$/, "");
}

/** ISO timestamp -> local `dd.MM, HH:mm`. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (v: number) => String(v).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}, ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function formatSellout(b: SelloutBand): string {
  if (b.low_pct === null && b.high_pct !== null) return `< ${b.high_pct}${NBSP}%`;
  if (b.high_pct === null && b.low_pct !== null) return `> ${b.low_pct}${NBSP}%`;
  if (b.low_pct !== null && b.high_pct !== null) {
    return `≈ ${b.low_pct}–${b.high_pct}${NBSP}%`;
  }
  return "—";
}

/** The one clamp for demand shown in the card, the chart and the history. */
export function displayWants(n: number): number {
  return Math.max(0, n);
}
