import type { ForecastResponse } from "../../api/types";
import { displayWants, formatInt, formatRub, formatSellout } from "../../lib/format";

interface Props {
  result: ForecastResponse;
  onUseRecommended: (price: number) => void;
}

const EXPLANATIONS: Record<ForecastResponse["limit"], string> = {
  none: "Спрос ниже числа мест: все желающие купят билет, часть мест останется свободной.",
  no_demand:
    "При такой цене билет никто не купит: расчёт спроса ушёл ниже нуля, поэтому в карточке показан 0.",
  seats:
    "Спрос выше числа мест, поэтому продажи упираются в места: самолёт заполнится, а часть желающих не получит билет.",
};

function Card({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid content-start gap-1 rounded-xl border border-border bg-surface p-4">
      <span className="text-sm text-muted">{label}</span>
      {children}
    </div>
  );
}

const VALUE = "text-2xl font-semibold tabular-nums tracking-tight";

export function ResultPanel({ result, onUseRecommended }: Props) {
  const { recommendation: rec } = result;
  const negative = result.wants < 0;

  return (
    <section aria-label="Результат прогноза" className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card label="Мест в самолёте">
          <span className={VALUE}>{formatInt(result.seats)}</span>
        </Card>
        <Card label="Желают купить">
          <span className={VALUE}>{formatInt(displayWants(result.wants))}</span>
          {negative ? (
            <span className="text-xs text-muted">
              расчёт: {formatInt(result.wants).replace("-", "−")}
            </span>
          ) : null}
        </Card>
        <Card label="Купят">
          <span className={VALUE}>{formatInt(result.buys)}</span>
        </Card>
        <Card label="Свободно">
          <span className={VALUE}>{formatInt(result.free_seats)}</span>
        </Card>
      </div>

      {!result.price_in_range ? (
        <p role="alert" className="rounded-lg border border-danger px-3 py-2 text-sm text-danger">
          {`Цена вне диапазона маршрута (${formatInt(result.price_min)}–${formatRub(result.price_max)}): прогноз при такой цене менее надёжен.`}
        </p>
      ) : null}

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
          {`Коридор: ${formatInt(rec.corridor_low)}–${formatRub(rec.corridor_high)} (±${rec.corridor_pct} %)`}
        </p>
        {rec.risky ? (
          <p className="w-fit rounded-full border border-demand-hits px-3 py-0.5 text-sm font-medium text-demand-hits">
            Рискованный рейс: прогноз цены неуверенный
          </p>
        ) : null}
      </div>
    </section>
  );
}
