import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";

import { formatInt } from "../../lib/format";
import { useReducedMotion } from "../../lib/motion";
import { HATCH_OUTLINE, HatchPattern } from "./Hatch";
import { seatLayout } from "./seatLayout";
import "./seatmap.css";

export interface SeatMapProps {
  seats: number;
  buys: number;
  wants: number;
}

/** jsdom and the first render before a measurement have no width. */
const FALLBACK_WIDTH = 320;
/** Room for the 1.5 px outline around the queue block. */
const OUTLINE_PAD = 1;

/** Inline legend square in front of a caption part. */
function Swatch({ className }: { className: string }) {
  return (
    <span
      aria-hidden="true"
      className={`mr-2 inline-block size-3 rounded-cell align-middle ${className}`}
    />
  );
}

export function SeatMap({ seats, buys, wants }: SeatMapProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(FALLBACK_WIDTH);
  const reduced = useReducedMotion();
  const hatchId = `seatmap-hatch-${useId().replace(/[^\w-]/g, "")}`;

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
  const queueBox = {
    width: queue.width + OUTLINE_PAD * 2,
    height: queue.height + OUTLINE_PAD * 2,
  };

  // Taken seats are a calm grey and free ones a quiet cell: the yellow is kept for the people who
  // get no seat, hatched like «Не хватит мест» on the chart. min-w-0: as a grid item the figure has
  // to shrink below the svg it last drew, or a narrower board is never measured.
  return (
    <figure ref={ref} className="m-0 grid min-w-0 gap-3">
      <svg
        aria-hidden="true"
        focusable="false"
        width={layout.width}
        height={layout.height}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        className={reduced ? "block max-w-full" : "seatmap-anim block max-w-full"}
      >
        <path className="seatmap-filled fill-bar" d={layout.filledPath} />
        <path className="fill-flap-hi" d={layout.freePath} />
      </svg>
      {queue.count > 0 ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-board-line pt-3">
          <svg
            aria-hidden="true"
            focusable="false"
            width={queueBox.width}
            height={queueBox.height}
            viewBox={`${-OUTLINE_PAD} ${-OUTLINE_PAD} ${queueBox.width} ${queueBox.height}`}
            className="block max-w-full shrink-0"
          >
            <defs>
              <HatchPattern id={hatchId} />
            </defs>
            <path d={queue.path} fill={`url(#${hatchId})`} {...HATCH_OUTLINE} />
          </svg>
          <p className="text-sm text-board-ink">{`Не хватит мест: ${formatInt(queue.count)}`}</p>
        </div>
      ) : null}
      <p className="text-sm text-board-ink-2">
        <Swatch className="bg-bar" />
        {`Занято ${formatInt(taken)} из ${formatInt(seats)} мест · `}
        <Swatch className="bg-flap-hi" />
        {`свободно ${formatInt(seats - taken)}`}
      </p>
    </figure>
  );
}
