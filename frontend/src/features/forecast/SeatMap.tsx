import { useLayoutEffect, useMemo, useRef, useState } from "react";

import { formatInt } from "../../lib/format";
import { useReducedMotion } from "../../lib/motion";
import { seatLayout } from "./seatLayout";
import "./seatmap.css";

export interface SeatMapProps {
  seats: number;
  buys: number;
  wants: number;
}

/** jsdom and the first render before a measurement have no width. */
const FALLBACK_WIDTH = 320;
const LABEL_SIZE = 12;

export function SeatMap({ seats, buys, wants }: SeatMapProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(FALLBACK_WIDTH);
  const reduced = useReducedMotion();

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
  }, []);

  const layout = useMemo(
    () => seatLayout({ seats, buys, wants, width }),
    [seats, buys, wants, width],
  );
  const taken = Math.min(buys, seats);
  const { queue } = layout;
  const cabinHeight = layout.rows * (layout.unit + layout.gap) - layout.gap;
  const gateY = cabinHeight + 3;
  const labelX = queue.shown * (Math.min(layout.unit, 12) + layout.gap) + 4;

  return (
    <figure ref={ref} className="m-0">
      <svg
        aria-hidden="true"
        focusable="false"
        width={layout.width}
        height={layout.height}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        className={reduced ? undefined : "seatmap-anim"}
      >
        <path className="seatmap-filled fill-sign" d={layout.filledPath} />
        <path className="fill-none stroke-board-ink-2" strokeWidth={1} d={layout.freePath} />
        {queue.count > 0 && (
          <>
            <line
              className="stroke-board-ink-2"
              strokeWidth={1}
              x1={0}
              x2={layout.width}
              y1={gateY}
              y2={gateY}
            />
            <path className="fill-sign" d={queue.path} />
            {queue.more > 0 && (
              <text className="fill-board-ink-2" x={labelX} y={layout.height} fontSize={LABEL_SIZE}>
                {`+${queue.more}`}
              </text>
            )}
          </>
        )}
      </svg>
      <p className="mt-2 text-sm text-board-ink-2">
        {`Занято ${formatInt(taken)} из ${formatInt(seats)} мест · свободно ${formatInt(seats - taken)}`}
        {queue.count > 0 && ` · Без места остаются: ${formatInt(queue.count)}`}
      </p>
    </figure>
  );
}
