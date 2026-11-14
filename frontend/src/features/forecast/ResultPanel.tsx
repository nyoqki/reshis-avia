import type { ForecastResponse } from "../../api/types";
import {
  displayWants,
  formatInt,
  formatRub,
  formatRubRange,
  formatSellout,
  formatSigned,
} from "../../lib/format";

interface Props {
  result: ForecastResponse;
  onUseRecommended: (price: number) => void;
}

const EXPLANATIONS: Record<ForecastResponse["limit"], string> = {
  none: "Спрос ниже числа мест: все желающие купят билет, часть мест останется свободной.",
  no_demand:
    "При такой цене билет никто не купит: по формуле спрос ушёл ниже нуля, поэтому в карточке показан 0.",
  seats:
    "Спрос выше числа мест, поэтому продажи упираются в места: самолёт заполнится, а часть желающих не получит билет.",
};

function Card({ label, children }: { label: string; children: React.ReactNode }) {
  // Each card spans three rows of the parent grid as a subgrid (label, number, optional note): the labels
  // share one row, so the numbers line up even when a label wraps («Мест в самолёте» on a narrow card).
  return (
    <div className="row-span-3 grid grid-rows-subgrid gap-0 rounded-xl border border-border bg-surface p-4">
      <span className="pb-1 text-sm text-muted">{label}</span>
      {children}
    </div>
  );
}

const VALUE = "text-2xl font-semibold tabular-nums tracking-tight";

export function ResultPanel({ result, onUseRecommended }: Props) {
  const { recommendation: rec } = result;
  // `wants` arrives clamped at 0; only `wants_raw` carries the negative calculation.
  const raw = Math.round(result.wants_raw);
  const negative = raw < 0;

  return (
    <section aria-labelledby="result-heading" className="grid gap-4">
      <h2 id="result-heading" className="text-lg font-semibold">
        Результат прогноза
      </h2>

      {/* Above the cards: on a phone the cards fill the screen and a warning under them goes unseen. */}
      {!result.price_in_range ? (
        <p role="alert" className="rounded-lg border border-danger px-3 py-2 text-sm text-danger">
          {`Цена вне диапазона маршрута (${formatRubRange(result.price_min, result.price_max)}): прогноз при такой цене менее надёжен.`}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card label="Мест в самолёте">
          <span className={VALUE}>{formatInt(result.seats)}</span>
        </Card>
        <Card label="Желают купить">
          <span className={VALUE}>{formatInt(displayWants(result.wants))}</span>
          {negative ? (
            <span className="text-xs text-muted">по формуле: {formatSigned(raw)}</span>
          ) : null}
        </Card>
        <Card label="Купят">
          <span className={VALUE}>{formatInt(result.buys)}</span>
        </Card>
        <Card label="Свободно">
          <span className={VALUE}>{formatInt(result.free_seats)}</span>
        </Card>
      </div>

      <p className="text-sm">{EXPLANATIONS[result.limit]}</p>
      <p className="text-sm font-medium">
        {`Вероятность распродажи: ${formatSellout(result.sellout)}`}
      </p>

      <div className="grid gap-2 rounded-xl border border-border bg-surface p-4">
        <span className="text-sm text-muted">Рекомендуемая цена</span>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className={VALUE}>{formatRub(rec.price)}</span>
          <button
            type="button"
            onClick={() => onUseRecommended(rec.price)}
            className="min-h-11 cursor-pointer rounded-lg border border-accent px-4 text-base font-semibold text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Подставить
          </button>
        </div>
        <p className="text-sm text-muted">
          {`Коридор: ${formatRubRange(rec.corridor_low, rec.corridor_high)}, ширина ${rec.corridor_pct} % от рекомендованной цены`}
        </p>
        {rec.risky ? (
          <p className="w-fit rounded-full border border-demand-hits px-3 py-0.5 text-sm font-medium text-demand-hits-text">
            Рискованный рейс: прогноз цены неуверенный
          </p>
        ) : null}
      </div>
    </section>
  );
}
