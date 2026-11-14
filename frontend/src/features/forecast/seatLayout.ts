/** Maximum number of queue marks drawn at the gate; the rest is a «+N» label. */
export const QUEUE_MAX = 12;

const MIN_UNIT = 3;
const MAX_UNIT = 16;
const GAP = 1;
/** The cabin is kept at most this tall, the queue row comes below it. */
const MAX_CABIN_HEIGHT = 200;
const QUEUE_LANE = 12;
/** Space under the cabin for the gate mark and the queue row. */
const GATE_PAD = 6;

export interface SeatLayoutInput {
  seats: number;
  buys: number;
  wants: number;
  width: number;
}

export interface SeatLayout {
  width: number;
  height: number;
  unit: number;
  gap: number;
  columns: number;
  rows: number;
  filledPath: string;
  freePath: string;
  queue: { count: number; shown: number; more: number; path: string };
}

function rect(x: number, y: number, size: number): string {
  return `M${x} ${y}h${size}v${size}h${-size}Z`;
}

function unitFor(columns: number, width: number): number {
  return Math.min(MAX_UNIT, Math.floor((width - (columns - 1) * GAP) / columns));
}

/** Fewest columns that give the largest unit while the cabin stays under the height cap. */
function pickColumns(seats: number, width: number): { columns: number; unit: number } {
  let best = { columns: Math.max(1, seats), unit: MIN_UNIT };
  let bestUnit = -1;
  for (let columns = 1; columns <= Math.max(1, seats); columns += 1) {
    const unit = unitFor(columns, width);
    if (unit < 1) break;
    const rows = Math.ceil(seats / columns);
    if (rows * (unit + GAP) - GAP > MAX_CABIN_HEIGHT) continue;
    if (unit > bestUnit) {
      bestUnit = unit;
      best = { columns, unit };
    }
  }
  if (bestUnit < 0) {
    const columns = Math.max(1, Math.min(seats, Math.floor((width + GAP) / (MIN_UNIT + GAP))));
    return { columns, unit: Math.max(1, unitFor(columns, width)) };
  }
  return best;
}

export function seatLayout({ seats, buys, wants, width }: SeatLayoutInput): SeatLayout {
  const total = Math.max(0, Math.floor(seats));
  const filled = Math.min(Math.max(0, Math.floor(buys)), total);
  const { columns, unit } = pickColumns(total, Math.max(1, Math.floor(width)));
  const rows = total === 0 ? 0 : Math.ceil(total / columns);
  const step = unit + GAP;

  let filledPath = "";
  let freePath = "";
  for (let i = 0; i < total; i += 1) {
    const mark = rect((i % columns) * step, Math.floor(i / columns) * step, unit);
    if (i < filled) filledPath += mark;
    else freePath += mark;
  }

  const count = Math.max(0, Math.floor(wants) - total);
  const shown = Math.min(count, QUEUE_MAX);
  const more = count - shown;
  const cabinHeight = rows === 0 ? 0 : rows * step - GAP;
  const qUnit = Math.min(unit, QUEUE_LANE);
  const queueY = cabinHeight + GATE_PAD;
  let queuePath = "";
  for (let i = 0; i < shown; i += 1) queuePath += rect(i * (qUnit + GAP), queueY, qUnit);

  const height = count > 0 ? queueY + qUnit : cabinHeight;
  return {
    width,
    height,
    unit,
    gap: GAP,
    columns,
    rows,
    filledPath,
    freePath,
    queue: { count, shown, more, path: queuePath },
  };
}
