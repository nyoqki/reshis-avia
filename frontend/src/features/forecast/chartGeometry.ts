import { formatInt } from "../../lib/format";
import type { BarKind, ChartModel } from "./chartData";

export interface AxisTick {
  value: number;
  label: string;
}

export interface ChartBox {
  width: number;
  height: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface BarGeometry {
  index: number;
  x: number;
  width: number;
  y: number;
  height: number;
  /** y of the seats line inside a hits bar, where the hatched part begins; null for below bars. */
  seatsY: number | null;
  kind: BarKind;
  median: boolean;
}

export interface ChartGeometry {
  plot: { x: number; y: number; width: number; height: number };
  yMax: number;
  ticks: Array<AxisTick & { y: number }>;
  seatsY: number;
  bars: BarGeometry[];
}

const STEP_MULTIPLIERS = [1, 2, 2.5, 5];
const BAR_FILL = 0.7;

/** Axis ticks from zero with a step of 1, 2, 2.5 or 5 times a power of ten (whole numbers only). */
export function niceTicks(maxValue: number, maxTicks = 5): AxisTick[] {
  if (!(maxValue > 0)) {
    return [
      { value: 0, label: formatInt(0) },
      { value: 1, label: formatInt(1) },
    ];
  }
  const maxIntervals = Math.max(1, maxTicks - 1);
  let step = 1;
  search: for (let power = 1; ; power *= 10) {
    for (const m of STEP_MULTIPLIERS) {
      const candidate = m * power;
      if (!Number.isInteger(candidate)) continue;
      if (Math.ceil(maxValue / candidate) <= maxIntervals) {
        step = candidate;
        break search;
      }
    }
  }
  const count = Math.ceil(maxValue / step);
  return Array.from({ length: count + 1 }, (_, i) => ({
    value: i * step,
    label: formatInt(i * step),
  }));
}

export function layoutChart(model: ChartModel, box: ChartBox): ChartGeometry {
  const plot = {
    x: box.left,
    y: box.top,
    width: box.width - box.left - box.right,
    height: box.height - box.top - box.bottom,
  };
  const ticks = niceTicks(Math.max(...model.values, model.seats));
  const yMax = ticks[ticks.length - 1].value;
  const plotBottom = plot.y + plot.height;
  const yOf = (v: number) => plotBottom - (v / yMax) * plot.height;
  const seatsY = yOf(model.seats);

  const n = model.values.length;
  const slot = n > 0 ? plot.width / n : 0;
  const width = slot * BAR_FILL;
  const bars = model.values.map((value, index): BarGeometry => {
    const y = yOf(value);
    const kind = model.kinds[index] ?? "below";
    return {
      index,
      x: plot.x + index * slot + (slot - width) / 2,
      width,
      y,
      height: plotBottom - y,
      seatsY: kind === "hits" ? Math.min(Math.max(seatsY, y), plotBottom) : null,
      kind,
      median: index === model.medianIndex,
    };
  });

  return { plot, yMax, ticks: ticks.map((t) => ({ ...t, y: yOf(t.value) })), seatsY, bars };
}
