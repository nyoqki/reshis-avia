import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  type ChartConfiguration,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from "chart.js";
import { useEffect, useMemo, useRef, useState } from "react";

import type { ForecastResponse } from "../../api/types";
import { formatInt } from "../../lib/format";
import { type BarKind, buildChartModel } from "./chartData";

Chart.register(
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
);

const NBSP = " ";

interface Palette {
  below: string;
  hits: string;
  median: string;
  text: string;
  muted: string;
  border: string;
  surface: string;
}

function readPalette(): Palette {
  const style = getComputedStyle(document.documentElement);
  const get = (name: string) => style.getPropertyValue(name).trim();
  return {
    below: get("--demand-below"),
    hits: get("--demand-hits"),
    median: get("--demand-median"),
    text: get("--text"),
    muted: get("--muted"),
    border: get("--border"),
    surface: get("--surface"),
  };
}

/** The theme colours, re-read whenever the theme attribute or the system colour scheme changes. */
function usePalette(): Palette {
  const [palette, setPalette] = useState(readPalette);
  useEffect(() => {
    const bump = () => setPalette(readPalette());
    const observer = new MutationObserver(bump);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    const media =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-color-scheme: dark)")
        : null;
    media?.addEventListener?.("change", bump);
    return () => {
      observer.disconnect();
      media?.removeEventListener?.("change", bump);
    };
  }, []);
  return palette;
}

function barColor(kind: BarKind, palette: Palette): string {
  if (kind === "hits") return palette.hits;
  if (kind === "median") return palette.median;
  return palette.below;
}

function summary(result: ForecastResponse): string {
  const model = buildChartModel(result);
  const median = formatInt(model.values[model.medianIndex]);
  const hits = model.kinds.filter((k) => k === "hits").length;
  return `Спрос по девяти сценариям при цене ${formatInt(result.price)}${NBSP}₽. Мест в самолёте: ${formatInt(model.seats)}, медиана спроса: ${median}. Сценариев, где спрос не ниже числа мест: ${hits} из ${model.kinds.length}.`;
}

export function ScenarioChart({ result }: { result: ForecastResponse }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const palette = usePalette();
  const model = useMemo(() => buildChartModel(result), [result]);
  const label = useMemo(() => summary(result), [result]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // jsdom and very old browsers have no canvas context: the table below stays the fallback
    let context: CanvasRenderingContext2D | null = null;
    try {
      context = canvas.getContext("2d");
    } catch {
      context = null;
    }
    if (!context) return;

    const config: ChartConfiguration<"bar" | "line", number[], string> = {
      type: "bar",
      data: {
        labels: model.labels,
        datasets: [
          {
            type: "bar",
            label: "Желают купить",
            data: model.values,
            backgroundColor: model.kinds.map((k) => barColor(k, palette)),
            borderColor: model.kinds.map((_, i) =>
              i === model.medianIndex ? palette.text : "transparent",
            ),
            borderWidth: model.kinds.map((_, i) => (i === model.medianIndex ? 3 : 0)),
            order: 2,
          },
          {
            type: "line",
            label: `Мест в самолёте: ${formatInt(model.seats)}`,
            data: model.values.map(() => model.seats),
            borderColor: palette.text,
            borderDash: [6, 4],
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 0,
            order: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        scales: {
          x: {
            ticks: {
              color: palette.muted,
              maxRotation: 0,
              autoSkip: false,
              // the nine long labels collide on a phone; the table below carries the full names
              callback: (_value, index) => `${model.labels[index].split(/\s/)[0]}${NBSP}%`,
            },
            grid: { display: false },
            border: { color: palette.border },
          },
          y: {
            beginAtZero: true,
            ticks: { color: palette.muted, callback: (v) => formatInt(Number(v)) },
            grid: { color: palette.border },
            border: { color: palette.border },
          },
        },
        plugins: {
          legend: {
            labels: {
              color: palette.text,
              // one entry per bar colour (the bar dataset alone would show just the first one) plus the seats line
              generateLabels: () =>
                [
                  { text: "Ниже числа мест", fillStyle: palette.below, strokeStyle: palette.below },
                  {
                    text: "Не ниже числа мест",
                    fillStyle: palette.hits,
                    strokeStyle: palette.hits,
                  },
                  {
                    text: "Медиана (обводка)",
                    fillStyle: "transparent",
                    strokeStyle: palette.text,
                    lineWidth: 3,
                  },
                  {
                    text: `Мест в самолёте: ${formatInt(model.seats)}`,
                    fillStyle: "transparent",
                    strokeStyle: palette.text,
                    lineWidth: 2,
                    lineDash: [6, 4],
                  },
                ].map((item) => ({ ...item, fontColor: palette.text })),
            },
            onClick: () => undefined,
          },
          tooltip: {
            backgroundColor: palette.surface,
            titleColor: palette.text,
            bodyColor: palette.text,
            borderColor: palette.border,
            borderWidth: 1,
            callbacks: {
              label: (item) => {
                if (item.datasetIndex !== 0) return `Мест: ${formatInt(model.seats)}`;
                const i = item.dataIndex;
                return [
                  `Желают: ${formatInt(model.values[i])} (сырое: ${formatInt(model.rawValues[i])})`,
                  `Купят: ${formatInt(result.scenarios[i].buys)}`,
                ];
              },
            },
          },
        },
      },
    };

    const chart = new Chart(canvas, config);
    return () => chart.destroy();
  }, [model, result, palette]);

  return (
    <section aria-label="Распределение спроса" className="grid gap-3">
      <h2 className="text-base font-semibold">Распределение спроса по сценариям</h2>
      <div className="h-72 w-full rounded-xl border border-border bg-surface p-3">
        <canvas ref={canvasRef} role="img" aria-label={label} />
      </div>
      <p className="text-sm text-muted">{`Между соседними столбиками — 10${NBSP}% вероятности`}</p>
      <details className="rounded-xl border border-border bg-surface p-3 text-sm" open>
        <summary className="cursor-pointer py-2 font-medium">Таблица сценариев</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full border-collapse text-left tabular-nums">
            <thead>
              <tr className="text-muted">
                <th scope="col" className="py-1 pr-3 font-medium">
                  Сценарий
                </th>
                <th scope="col" className="py-1 pr-3 text-right font-medium">
                  Желают
                </th>
                <th scope="col" className="py-1 text-right font-medium">
                  Купят
                </th>
              </tr>
            </thead>
            <tbody>
              {result.scenarios.map((s, i) => (
                <tr key={s.quantile} className="border-t border-border">
                  <th scope="row" className="py-1 pr-3 font-normal">
                    {model.labels[i]}
                  </th>
                  <td className="py-1 pr-3 text-right">{formatInt(model.values[i])}</td>
                  <td className="py-1 text-right">{formatInt(s.buys)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
