export type FlapSize = "xs" | "compact" | "sm" | "md" | "lg" | "fit";

export interface FlapCellProps {
  char: string;
  tone?: "board" | "sign" | "blank";
  size?: FlapSize;
  flipping?: boolean;
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
 * One split-flap cell. It has no text node: the two leaves, the hinge line and the glyph are drawn
 * by board.css from data-char, so screen readers and text queries see only the readable text that
 * the parent renders next to the cells. `flipping` adds a transform-only flip of the top leaf.
 */
export function FlapCell({ char, tone = "board", size = "md", flipping = false }: FlapCellProps) {
  const classes = ["flap-cell", FLAP_SIZE[size], flipping ? "flap-cell--flipping" : ""]
    .filter(Boolean)
    .join(" ");
  return <span className={classes} data-char={char} data-tone={tone} />;
}
