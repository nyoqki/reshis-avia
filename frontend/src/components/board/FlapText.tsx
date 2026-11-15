import { FlapCell, type FlapSize } from "./FlapCell";
import { FLAP_LETTERS, useFlapSequence } from "./useFlapSequence";

export interface FlapTextProps {
  text: string;
  srText?: string;
  minCells?: number;
  size?: FlapSize;
  tone?: "board" | "sign";
  delayMs?: number;
  play?: boolean;
  className?: string;
}

/**
 * A word on flap cells. The readable text (srText, or text) sits in a visually hidden span; the
 * cells beside it are aria-hidden and carry no text, so the text content is always the final value
 * while the cells cycle and settle. Short words get blank cells at the start up to minCells.
 */
export function FlapText({
  text,
  srText,
  minCells = 0,
  size = "md",
  tone = "board",
  delayMs,
  play,
  className,
}: FlapTextProps) {
  const target = text.padStart(Math.max(minCells, text.length), " ");
  const shown = useFlapSequence(target, { delayMs, play, alphabet: FLAP_LETTERS });
  const keys = Array.from({ length: target.length }, (_, i) => `cell-${i}`);
  const classes = ["inline-flex", className ?? ""].filter(Boolean).join(" ");
  return (
    <span className={classes}>
      <span className="sr-only">{srText ?? text}</span>
      <span aria-hidden="true" className="flap-row">
        {keys.map((key, i) => (
          <FlapCell key={key} char={shown[i]} tone={tone} size={size} />
        ))}
      </span>
    </span>
  );
}
