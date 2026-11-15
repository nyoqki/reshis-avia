import type { ForecastResponse } from "../../api/types";
import { Board } from "../../components/board/Board";
import type { FlapSize } from "../../components/board/FlapCell";
import { FlapNumber } from "../../components/board/FlapNumber";
import { FlapText } from "../../components/board/FlapText";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Notice } from "../../components/ui/Notice";
import { TermHint } from "../../components/ui/TermHint";
import {
  displayWants,
  formatDate,
  formatRub,
  formatRubRange,
  formatSellout,
  formatSigned,
} from "../../lib/format";
import { SeatMap } from "./SeatMap";
import { TERMS, type TermKey } from "./terms";

interface Props {
  result: ForecastResponse;
  onUseRecommended: (price: number) => void;
  pending?: boolean;
}

const STATUS: Record<ForecastResponse["limit"], { text: string; srText: string }> = {
  none: { text: "ЕСТЬ МЕСТА", srText: "Есть места" },
  seats: { text: "МЕСТ НЕТ", srText: "Мест нет" },
  no_demand: { text: "НЕТ СПРОСА", srText: "Нет спроса" },
};

function Hint({ k }: { k: TermKey }) {
  return (
    <TermHint term={TERMS[k].term} surface="board">
      {TERMS[k].text}
    </TermHint>
  );
}

const EXPLANATIONS: Record<ForecastResponse["limit"], string> = {
  none: "Спрос ниже числа мест: все желающие купят билет, часть мест останется свободной.",
  no_demand:
    "При такой цене билет никто не купит: по формуле спрос ушёл ниже нуля, поэтому в карточке показан 0.",
  seats:
    "Спрос выше числа мест, поэтому продажи упираются в места: самолёт заполнится, а часть желающих не получит билет.",
};

function Card({
  label,
  hint,
  value,
  minCells,
  size,
  index,
  note,
}: {
  label: string;
  hint?: TermKey;
  value: number;
  minCells: number;
  size: FlapSize;
  index: number;
  note?: string;
}) {
  return (
    <div className="grid content-start gap-2 rounded-cell border border-board-line bg-flap p-4">
      {/* two lines tall, so the numbers line up when one label wraps and its neighbour does not */}
      <span className="flex min-h-10 items-start gap-2 text-sm text-board-ink-2">
        {label}
        {hint ? <Hint k={hint} /> : null}
      </span>
      <FlapNumber value={value} minCells={minCells} size={size} delayMs={index * 120} />
      {note ? <span className="text-sm text-board-ink-2">{note}</span> : null}
    </div>
  );
}

export function ResultPanel({ result, onUseRecommended, pending = false }: Props) {
  const { recommendation: rec } = result;
  // `wants` arrives clamped at 0; only `wants_raw` carries the negative calculation.
  const raw = Math.round(result.wants_raw);
  const negative = raw < 0;
  const [fromCode = "", toCode = ""] = result.route.split("-");
  const status = STATUS[result.limit];
  const values = [result.seats, displayWants(result.wants), result.buys, result.free_seats];
  const minCells = Math.max(...values.map((v) => String(Math.abs(Math.round(v))).length));
  // Four digits (1 440 seats) do not fit a quarter of the board at the md cell size: smaller cells,
  // and four cards in a row only where the board is wide enough for them.
  const wide = minCells >= 4;
  const cellSize: FlapSize = wide ? "sm" : "md";
  const cardGrid = wide ? "grid-cols-2 @2xl:grid-cols-4" : "grid-cols-2 @xl:grid-cols-4";

  return (
    <Board
      as="section"
      aria-labelledby="result-heading"
      header={
        <div className="grid gap-2">
          <h2 id="result-heading" className="text-lg font-semibold">
            Результат прогноза
          </h2>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-board-ink-2">
            <p className="text-board-ink">
              {`${result.origin} ${fromCode} → ${result.destination} ${toCode}`}
            </p>
            <p>{formatDate(result.date)}</p>
            <p>{formatRub(result.price)}</p>
          </div>
          <FlapText text={status.text} srText={status.srText} size="sm" />
        </div>
      }
    >
      <div className="@container grid gap-4">
        {/* Above the cards: on a phone the cards fill the screen and a warning under them goes unseen. */}
        {!result.price_in_range ? (
          <Notice tone="warning" surface="board" role="alert">
            {`Цена вне диапазона маршрута (${formatRubRange(result.price_min, result.price_max)}): прогноз при такой цене менее надёжен.`}
          </Notice>
        ) : null}

        <div className={`grid gap-3 ${cardGrid}`}>
          <Card
            label="Мест в самолёте"
            value={values[0]}
            minCells={minCells}
            size={cellSize}
            index={0}
          />
          <Card
            label="Желают купить"
            hint="wants"
            value={values[1]}
            minCells={minCells}
            size={cellSize}
            index={1}
            note={negative ? `по формуле: ${formatSigned(raw)}` : undefined}
          />
          <Card
            label="Купят"
            hint="buys"
            value={values[2]}
            minCells={minCells}
            size={cellSize}
            index={2}
          />
          <Card
            label="Свободно"
            hint="free"
            value={values[3]}
            minCells={minCells}
            size={cellSize}
            index={3}
          />
        </div>

        <p className="text-sm">{EXPLANATIONS[result.limit]}</p>

        <SeatMap seats={result.seats} buys={result.buys} wants={result.wants} />

        <p className="flex items-center gap-2 text-sm font-medium">
          {`Вероятность распродажи: ${formatSellout(result.sellout)}`}
          <Hint k="sellout" />
        </p>

        <div className="grid gap-2 rounded-cell border border-board-line bg-flap p-4">
          <span className="flex items-center gap-2 text-sm text-board-ink-2">
            Рекомендуемая цена
            <Hint k="recommended" />
          </span>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="font-mono text-xl font-semibold tabular-nums">
              {formatRub(rec.price)}
            </span>
            <Button
              variant="primary"
              aria-disabled={pending ? "true" : undefined}
              onClick={() => {
                if (pending) return;
                onUseRecommended(rec.price);
              }}
            >
              Подставить
            </Button>
          </div>
          <p className="text-sm text-board-ink-2">
            {`Коридор: ${formatRubRange(rec.corridor_low, rec.corridor_high)}, ширина ${rec.corridor_pct} % от рекомендованной цены`}
          </p>
          {rec.risky ? (
            <div className="flex items-center gap-2">
              <Badge tone="risk" surface="board">
                Рискованный рейс: прогноз цены неуверенный
              </Badge>
              <Hint k="risky" />
            </div>
          ) : null}
        </div>
      </div>
    </Board>
  );
}
