import "./hatch.css";

/**
 * The «Не хватит мест» stripes: yellow on the board colour at 45°. The chart hatches the part of a
 * bar above the seats line with it and the seat map the queue at the gate, so both views mark the
 * same people the same way. Place it inside the svg's <defs>.
 */
export function HatchPattern({ id }: { id: string }) {
  return (
    <pattern
      id={id}
      patternUnits="userSpaceOnUse"
      width="6"
      height="6"
      patternTransform="rotate(45)"
    >
      <rect width="6" height="6" className="fill-board" />
      <rect width="2" height="6" className="fill-sign" />
    </pattern>
  );
}

/** What the hatch marks, in the chart legend and at the seat map queue alike. */
export const SHORT_OF_SEATS = "Не\u00a0хватит мест";

/** The yellow outline around a hatched shape. */
export const HATCH_OUTLINE = { strokeWidth: 1.5, className: "stroke-sign" } as const;

/** Legend swatch for a hatched shape: the same stripes and outline drawn in CSS. */
export function HatchSwatch() {
  return <span aria-hidden="true" className="hatch-swatch size-3 shrink-0 rounded-cell" />;
}
