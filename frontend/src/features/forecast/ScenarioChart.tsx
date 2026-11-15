import {
  type KeyboardEvent,
  type RefObject,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";

import type { ForecastResponse } from "../../api/types";
import { Board } from "../../components/board/Board";
import { DataTable, type DataTableColumn } from "../../components/ui/DataTable";
import { TermHint } from "../../components/ui/TermHint";
import { formatInt, formatSigned } from "../../lib/format";
import { FLAP_STAGGER_MS, useReducedMotion } from "../../lib/motion";
import { buildChartModel, type ChartModel, tickLabel } from "./chartData";
import { axisTicks, type ChartBox, layoutChart } from "./chartGeometry";
import { HATCH_OUTLINE, HatchPattern, HatchSwatch, SHORT_OF_SEATS } from "./Hatch";
import { TERMS } from "./terms";
import "./chart.css";

const NBSP = "\u00a0";

const CHART_HEIGHT = 280;
/** jsdom and the first render before a measurement have no width. */
const FALLBACK_WIDTH = 640;
/**
 * Below this chart width the axis text drops from 14 px to 12 px (--text-axis) and the scenario
 * names move from the x-axis to the caption: nine columns leave them no room on a phone.
 */
const NARROW_WIDTH = 480;
const SEATS_DASH = "6 4";
/**
 * Gap between the end of the seats line and its label, and the margin reserved for the label: about
 * 0.51 em a character in semibold Golos Text, so 0.62 em leaves room for a wider fallback face
 * (the svg clips whatever does not fit).
 */
const SEATS_LABEL_GAP = 6;
const LABEL_EM = 0.62;

const HINT = `Наведите на${NBSP}столбик, коснитесь его или нажмите Tab${NBSP}— появятся точные числа.`;
const CAPTION = `Между соседними столбиками${NBSP}— 10${NBSP}% вероятности`;
// On a phone the scenario names leave the x-axis and are spelled out here.
const CAPTION_NARROW = `${CAPTION}. Сценарий 10${NBSP}%${NBSP}— пессимистичный, 50${NBSP}%${NBSP}— медиана, 90${NBSP}%${NBSP}— оптимистичный.`;
const EMPTY_NOTE = `Спрос нулевой во${NBSP}всех девяти сценариях, поэтому столбиков нет. Снизьте цену, чтобы увидеть распределение.`;

interface ScenarioRow {
  quantile: number;
  label: string;
  wants: number;
  buys: number;
}

const COLUMNS: DataTableColumn<ScenarioRow>[] = [
  { key: "scenario", header: "Сценарий", rowHeader: true, render: (row) => row.label },
  { key: "wants", header: "Желают", numeric: true, render: (row) => formatInt(row.wants) },
  { key: "buys", header: "Купят", numeric: true, render: (row) => formatInt(row.buys) },
];

function summary(model: ChartModel, result: ForecastResponse): string {
  const median = formatInt(model.values[model.medianIndex]);
  const hits = model.kinds.filter((k) => k === "hits").length;
  return `Спрос по девяти сценариям при цене ${formatInt(result.price)}${NBSP}₽. Мест в самолёте: ${formatInt(model.seats)}, медиана спроса: ${median}. Сценариев, где спрос не ниже числа мест: ${hits} из ${model.kinds.length}.`;
}

/** The element's width, kept current by ResizeObserver; the fallback until it is measured. */
function useWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(FALLBACK_WIDTH);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const measured = Math.floor(el.clientWidth);
      if (measured > 0) setWidth(measured);
    };
    measure();
    if (typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

type Grow = "none" | "pending" | "run";

/**
 * Bars grow once, when the chart first becomes visible. Only browsers with IntersectionObserver
 * and without reduced motion hide them first; everyone else sees full bars from the start.
 */
function useGrowOnReveal(ref: RefObject<HTMLElement | null>): Grow {
  const reduced = useReducedMotion();
  const [grow, setGrow] = useState<Grow>("none");
  const played = useRef(false);
  useLayoutEffect(() => {
    if (played.current) return;
    const el = ref.current;
    if (reduced || !el || typeof IntersectionObserver !== "function") {
      setGrow("none");
      return;
    }
    setGrow("pending");
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        played.current = true;
        setGrow("run");
        observer.disconnect();
      },
      { threshold: 0.3 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, reduced]);
  return grow;
}

export function ScenarioChart({ result }: { result: ForecastResponse }) {
  const model = useMemo(() => buildChartModel(result), [result]);
  const label = useMemo(() => summary(model, result), [model, result]);
  const hatchId = `chart-hatch-${useId().replace(/[^\w-]/g, "")}`;

  const plotRef = useRef<HTMLDivElement>(null);
  const width = useWidth(plotRef);
  const grow = useGrowOnReveal(plotRef);
  const narrow = width < NARROW_WIDTH;
  const axisPx = narrow ? 12 : 14;

  // «Мест: N» ends the seats line in a margin right of the plot, where no grid line or bar runs
  // however close the seats come to them. A phone has no width to spare for that margin, and its
  // grid lines run too close together for the label inside: there the legend under the axis names
  // the line.
  const seatsText = `Мест: ${formatInt(model.seats)}`;
  const seatsTextWidth = Math.ceil(seatsText.length * axisPx * LABEL_EM);

  const geometry = useMemo(() => {
    const ticks = axisTicks(model);
    const longest = Math.max(...ticks.map((t) => t.label.length));
    const box: ChartBox = {
      width,
      height: CHART_HEIGHT,
      top: 24,
      right: narrow ? 4 : seatsTextWidth + SEATS_LABEL_GAP * 2,
      // one line of percentages on a phone, a second line of scenario names on wider charts
      bottom: narrow ? axisPx + 12 : axisPx * 2 + 16,
      left: Math.ceil(longest * axisPx * 0.6) + 10,
    };
    return layoutChart(model, box);
  }, [model, width, axisPx, narrow, seatsTextWidth]);

  const { plot, bars } = geometry;
  const count = bars.length;
  const slot = count > 0 ? plot.width / count : 0;
  const plotBottom = plot.y + plot.height;

  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const [tabStop, setTabStop] = useState(0);
  const [hovered, setHovered] = useState<number | null>(null);
  const [current, setCurrent] = useState<number | null>(null);
  const activeIndex = hovered ?? current;
  const active = activeIndex !== null && activeIndex < count ? activeIndex : null;
  const stop = Math.min(tabStop, Math.max(0, count - 1));

  const select = (index: number) => {
    setCurrent(index);
    setTabStop(index);
  };

  const onBarKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = count - 1;
    let next: number;
    switch (event.key) {
      case "ArrowRight":
        next = Math.min(last, index + 1);
        break;
      case "ArrowLeft":
        next = Math.max(0, index - 1);
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = last;
        break;
      default:
        return;
    }
    event.preventDefault();
    setTabStop(next);
    buttons.current[next]?.focus();
  };

  const rows: ScenarioRow[] = result.scenarios.map((s, i) => ({
    quantile: s.quantile,
    label: model.labels[i],
    wants: model.values[i],
    buys: s.buys,
  }));

  const raw = active !== null ? model.rawValues[active] : 0;

  return (
    <section aria-label="Распределение спроса" className="grid gap-3">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">{`Распределение спроса по${NBSP}сценариям`}</h2>
        <TermHint term={TERMS.scenarios.term}>{TERMS.scenarios.text}</TermHint>
      </div>

      <Board as="div">
        <figure className="m-0 grid gap-3">
          {/* on phones the plot bleeds into the board padding: nine labels need every pixel */}
          <div ref={plotRef} className="relative -mx-4 sm:mx-0" style={{ height: CHART_HEIGHT }}>
            <svg
              role="img"
              aria-label={label}
              width={width}
              height={CHART_HEIGHT}
              className={`absolute inset-0 block tabular-nums ${narrow ? "text-axis" : "text-sm"}`}
            >
              <defs>
                <HatchPattern id={hatchId} />
              </defs>

              {active !== null ? (
                <rect
                  x={plot.x + active * slot}
                  y={plot.y}
                  width={slot}
                  height={plot.height}
                  className="fill-flap"
                />
              ) : null}

              {geometry.ticks.map((tick) => (
                <g key={tick.value}>
                  <line
                    x1={plot.x}
                    x2={plot.x + plot.width}
                    y1={Math.round(tick.y) + 0.5}
                    y2={Math.round(tick.y) + 0.5}
                    strokeWidth={1}
                    className={tick.value === 0 ? "stroke-board-ink-2" : "stroke-board-line"}
                  />
                  <text
                    x={plot.x - 6}
                    y={tick.y}
                    textAnchor="end"
                    dominantBaseline="middle"
                    className="fill-board-ink-2"
                  >
                    {tick.label}
                  </text>
                </g>
              ))}

              <g className="chart-bars" data-grow={grow}>
                {bars.map((bar) => (
                  <g
                    key={bar.index}
                    className="chart-bar"
                    style={
                      grow === "run"
                        ? { animationDelay: `${bar.index * FLAP_STAGGER_MS}ms` }
                        : undefined
                    }
                  >
                    <rect
                      data-kind={bar.kind}
                      data-median={bar.median ? "" : undefined}
                      x={bar.x}
                      y={bar.y}
                      width={bar.width}
                      height={bar.height}
                      className={bar.kind === "hits" ? "fill-sign" : "fill-bar"}
                    />
                    {bar.seatsY !== null && bar.seatsY > bar.y ? (
                      <rect
                        x={bar.x}
                        y={bar.y}
                        width={bar.width}
                        height={bar.seatsY - bar.y}
                        fill={`url(#${hatchId})`}
                        {...HATCH_OUTLINE}
                      />
                    ) : null}
                    {bar.median && bar.height > 0 ? (
                      <rect
                        x={bar.x - 3}
                        y={bar.y - 3}
                        width={bar.width + 6}
                        height={bar.height + 3}
                        strokeWidth={2}
                        className="fill-none stroke-board-ink"
                      />
                    ) : null}
                  </g>
                ))}
              </g>

              <line
                x1={plot.x}
                x2={plot.x + plot.width}
                y1={geometry.seatsY}
                y2={geometry.seatsY}
                strokeWidth={2}
                strokeDasharray={SEATS_DASH}
                className="stroke-board-ink"
              />
              {narrow ? null : (
                <text
                  x={plot.x + plot.width + SEATS_LABEL_GAP}
                  y={geometry.seatsY}
                  dominantBaseline="middle"
                  textAnchor="start"
                  className="fill-board-ink font-semibold"
                >
                  {seatsText}
                </text>
              )}

              {bars.map((bar) => {
                const tick = tickLabel(result.scenarios[bar.index]?.quantile ?? 0);
                const [pct, name] = Array.isArray(tick) ? tick : [tick, undefined];
                const centre = bar.x + bar.width / 2;
                const first = bar.index === 0;
                const last = bar.index === count - 1;
                return (
                  <g key={bar.index} className="fill-board-ink-2">
                    <text x={centre} y={plotBottom + axisPx + 6} textAnchor="middle">
                      {pct}
                    </text>
                    {name && !narrow ? (
                      // the edge names are longer than a column: pin them to the plot edges
                      <text
                        x={first ? plot.x : last ? plot.x + plot.width : centre}
                        y={plotBottom + axisPx * 2 + 8}
                        textAnchor={first ? "start" : last ? "end" : "middle"}
                      >
                        {name}
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </svg>

            {bars.map((bar) => (
              <button
                key={bar.index}
                ref={(el) => {
                  buttons.current[bar.index] = el;
                }}
                type="button"
                tabIndex={bar.index === stop ? 0 : -1}
                aria-label={`${model.labels[bar.index]}: желают ${formatInt(model.values[bar.index])}, купят ${formatInt(result.scenarios[bar.index]?.buys ?? 0)}`}
                // the readout follows focus in the same task, also for a programmatic focus()
                onFocus={() => flushSync(() => select(bar.index))}
                onBlur={(event) => {
                  if (!buttons.current.some((b) => b !== null && b === event.relatedTarget)) {
                    setCurrent(null);
                  }
                }}
                onClick={() => select(bar.index)}
                onPointerEnter={() => setHovered(bar.index)}
                onPointerLeave={() => setHovered(null)}
                onKeyDown={(event) => onBarKeyDown(event, bar.index)}
                className="chart-hit absolute rounded-control bg-transparent"
                style={{
                  left: plot.x + bar.index * slot,
                  top: plot.y,
                  width: slot,
                  height: CHART_HEIGHT - plot.y,
                }}
              />
            ))}

            {/* At a price nobody pays all nine bars are 0: without a word the empty axes look broken. */}
            {model.empty ? (
              <p
                className="pointer-events-none absolute top-1/2 -translate-y-1/2 rounded-control border border-board-line bg-flap px-4 py-3 text-center text-sm text-board-ink"
                style={{ left: plot.x, width: plot.width }}
              >
                {EMPTY_NOTE}
              </p>
            ) : null}
          </div>

          <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-board-ink-2">
            {model.empty ? null : (
              <>
                <li className="flex items-center gap-2">
                  <span aria-hidden="true" className="size-3 rounded-cell bg-sign" />
                  Самолёт заполнен
                </li>
                <li className="flex items-center gap-2">
                  <HatchSwatch />
                  {SHORT_OF_SEATS}
                </li>
                <li className="flex items-center gap-2">
                  <span aria-hidden="true" className="size-3 rounded-cell bg-bar" />
                  Ниже числа мест
                </li>
                <li className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="size-3 rounded-cell border-2 border-board-ink"
                  />
                  Медиана
                </li>
              </>
            )}
            <li className="flex items-center gap-2">
              <span aria-hidden="true" className="w-6 border-t-2 border-dashed border-board-ink" />
              {`Мест в${NBSP}самолёте: ${formatInt(model.seats)}`}
            </li>
          </ul>

          {/* Room for three lines on a phone (a negative formula value wraps that far), one from sm
              up, and always in place: the readout replaces the hint, or appears in an empty chart
              where there are no bars to hover, without moving the caption. */}
          {count > 0 ? (
            <div className="flex min-h-17 flex-wrap items-baseline gap-x-4 gap-y-1 text-sm sm:min-h-5">
              {active !== null ? (
                <>
                  <span className="font-semibold">{model.labels[active]}</span>
                  <span>
                    {`Желают: ${formatInt(model.values[active])}${raw < 0 ? ` (по${NBSP}формуле: ${formatSigned(raw)})` : ""}`}
                  </span>
                  <span>{`Купят: ${formatInt(result.scenarios[active]?.buys ?? 0)}`}</span>
                </>
              ) : model.empty ? null : (
                <span className="text-board-ink-2">{HINT}</span>
              )}
            </div>
          ) : null}

          <figcaption className="text-sm text-board-ink-2">
            {narrow ? CAPTION_NARROW : CAPTION}
          </figcaption>
        </figure>
      </Board>

      <details open className="max-w-xl rounded-board border border-line bg-paper-raised px-4">
        <summary className="cursor-pointer py-3 text-sm font-medium">Таблица сценариев</summary>
        <div className="overflow-x-auto pb-3">
          <DataTable columns={COLUMNS} rows={rows} rowKey={(row) => row.quantile} />
        </div>
      </details>
    </section>
  );
}
