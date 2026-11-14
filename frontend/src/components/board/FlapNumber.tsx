import { Fragment } from "react";
import { formatInt } from "../../lib/format";
import { FlapCell, type FlapSize } from "./FlapCell";
import { FLAP_DIGITS, useFlapSequence } from "./useFlapSequence";

export interface FlapNumberProps {
  value: number;
  minCells?: number;
  size?: FlapSize;
  delayMs?: number;
  play?: boolean;
  className?: string;
}

const NBSP = " ";

/**
 * An integer on flap cells. The text content is exactly formatInt(value); the cells are an
 * aria-hidden layer without text. The NBSP group separator becomes a gap between cells, and short
 * numbers get blank cells on the left up to minCells digits.
 */
export function FlapNumber({
  value,
  minCells = 0,
  size = "md",
  delayMs,
  play,
  className,
}: FlapNumberProps) {
  const text = formatInt(value);
  const groups = text.split(NBSP);
  const digits = groups.join("");
  const pad = " ".repeat(Math.max(0, minCells - digits.length));
  const target = pad + digits;
  const shown = useFlapSequence(target, { delayMs, play, alphabet: FLAP_DIGITS });
  // The first group carries the blank padding cells.
  const runs = [pad + groups[0], ...groups.slice(1)];
  const starts = runs.map((_, g) => runs.slice(0, g).reduce((n, run) => n + run.length, 0));
  const classes = ["inline-flex", className ?? ""].filter(Boolean).join(" ");
  return (
    <span className={classes}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true" className="flap-row">
        {runs.map((run, g) => (
          <Fragment key={`group-${starts[g]}`}>
            {g > 0 && <span className="flap-gap" />}
            {Array.from({ length: run.length }, (_, j) => {
              const i = starts[g] + j;
              return (
                <FlapCell
                  key={`cell-${i}`}
                  char={shown[i]}
                  size={size}
                  flipping={shown[i] !== target[i]}
                />
              );
            })}
          </Fragment>
        ))}
      </span>
    </span>
  );
}
