/**
 * The cabin is drawn at most this tall: a 900- or 1440-seat plane gets smaller seats instead of
 * a block that out-weighs the four numbers above it.
 */
export const MAX_CABIN_HEIGHT = 120;

const MIN_UNIT = 3;
const MAX_UNIT = 12;
const GAP = 1;
/** The queue block is at most this many rows; a longer queue grows wider instead. */
const QUEUE_ROWS = 4;
/** A queue this short stays on one row. */
const QUEUE_MIN_COLUMNS = 12;

export interface SeatLayoutInput {
  seats: number;
  buys: number;
  wants: number;
  width: number;
}

export interface QueueLayout {
  /** wants − seats: everyone who wants a ticket and gets no seat. */
  count: number;
  columns: number;
  rows: number;
  width: number;
  height: number;
  /** One outline around `count` seat-sized units, so a hatch fills it edge to edge. */
  path: string;
}

export interface SeatLayout {
  width: number;
  /** Height of the cabin. */
  height: number;
  unit: number;
  gap: number;
  columns: number;
  rows: number;
  filledPath: string;
  freePath: string;
  queue: QueueLayout;
}

function rect(x: number, y: number, size: number): string {
  return `M${x} ${y}h${size}v${size}h${-size}Z`;
}

/**
 * The largest seat that keeps the cabin under MAX_CABIN_HEIGHT, with as many columns as the width
 * holds, so every plane spans the board and less than one seat step is left over.
 */
function pickGrid(seats: number, width: number): { columns: number; unit: number } {
  for (let unit = MAX_UNIT; unit >= MIN_UNIT; unit -= 1) {
    const columns = Math.max(1, Math.min(seats, Math.floor((width + GAP) / (unit + GAP))));
    const rows = Math.ceil(seats / columns);
    if (rows * (unit + GAP) - GAP <= MAX_CABIN_HEIGHT) return { columns, unit };
  }
  return {
    columns: Math.max(1, Math.min(seats, Math.floor((width + GAP) / (MIN_UNIT + GAP)))),
    unit: MIN_UNIT,
  };
}

/**
 * The queue as a compact block of seat-sized units: one row up to QUEUE_MIN_COLUMNS people, then
 * at most QUEUE_ROWS rows, never wider than the cabin. A short last row leaves a notch on the right.
 * A queue longer than that block holds (a very low price on a small plane) fills it completely;
 * `count` keeps the real number for the caption, so the block never out-weighs the cabin.
 */
function queueLayout(count: number, unit: number, cabinColumns: number): QueueLayout {
  if (count <= 0) return { count: 0, columns: 0, rows: 0, width: 0, height: 0, path: "" };
  const step = unit + GAP;
  const columns = Math.min(
    cabinColumns,
    Math.max(Math.min(count, QUEUE_MIN_COLUMNS), Math.ceil(count / QUEUE_ROWS)),
  );
  const shown = Math.min(count, QUEUE_ROWS * columns);
  const rows = Math.ceil(shown / columns);
  const width = columns * step - GAP;
  const height = rows * step - GAP;
  const last = shown - (rows - 1) * columns;
  const path =
    last === columns
      ? `M0 0H${width}V${height}H0Z`
      : `M0 0H${width}V${(rows - 1) * step - GAP}H${last * step - GAP}V${height}H0Z`;
  return { count, columns, rows, width, height, path };
}

export function seatLayout({ seats, buys, wants, width }: SeatLayoutInput): SeatLayout {
  const total = Math.max(0, Math.floor(seats));
  const filled = Math.min(Math.max(0, Math.floor(buys)), total);
  const { columns, unit } = pickGrid(Math.max(1, total), Math.max(1, Math.floor(width)));
  const rows = total === 0 ? 0 : Math.ceil(total / columns);
  const step = unit + GAP;

  let filledPath = "";
  let freePath = "";
  for (let i = 0; i < total; i += 1) {
    const mark = rect((i % columns) * step, Math.floor(i / columns) * step, unit);
    if (i < filled) filledPath += mark;
    else freePath += mark;
  }

  return {
    width,
    height: rows === 0 ? 0 : rows * step - GAP,
    unit,
    gap: GAP,
    columns,
    rows,
    filledPath,
    freePath,
    queue: queueLayout(Math.max(0, Math.floor(wants) - total), unit, columns),
  };
}
