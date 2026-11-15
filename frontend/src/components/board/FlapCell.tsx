import { useState } from "react";

export type FlapSize = "xs" | "compact" | "sm" | "md" | "lg" | "fit";

export interface FlapCellProps {
  char: string;
  tone?: "board" | "sign" | "blank";
  size?: FlapSize;
}

/** xs…lg map to --text-flap-*; `fit` (xs on phones, sm from the sm breakpoint) lives in board.css. */
export const FLAP_SIZE: Record<FlapSize, string> = {
  xs: "text-flap-xs",
  compact: "text-flap-compact",
  sm: "text-flap-sm",
  md: "text-flap-md",
  lg: "text-flap-lg",
  fit: "flap-fit",
};

/**
 * One split-flap cell. It has no text node: the leaves, the hinge line and the glyphs are drawn by
 * board.css from data attributes, so screen readers and text queries see only the readable text
 * that the parent renders next to the cells. Only the lower half moves: the top leaf shows a new
 * character at once, and a new lower leaf (data-glyph) falls from the hinge onto the previous
 * character's lower half (data-prev). Each change mounts a fresh leaf, so its CSS animation runs
 * once per flip.
 */
export function FlapCell({ char, tone = "board", size = "md" }: FlapCellProps) {
  const [flip, setFlip] = useState({ char, prev: char, count: 0 });
  // State adjusted while rendering when the prop changes, as the React docs describe.
  if (flip.char !== char) setFlip({ char, prev: flip.char, count: flip.count + 1 });
  return (
    <span
      className={`flap-cell ${FLAP_SIZE[size]}`}
      data-char={char}
      data-prev={flip.prev}
      data-tone={tone}
    >
      {flip.count > 0 && <span key={flip.count} className="flap-leaf" data-glyph={char} />}
    </span>
  );
}
