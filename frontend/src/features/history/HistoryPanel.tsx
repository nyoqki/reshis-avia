import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError, api } from "../../api/client";
import type { HistoryItem } from "../../api/types";
import { displayWants, formatDate, formatDateTime, formatInt, formatRub } from "../../lib/format";

interface Props {
  refreshKey: number;
  onSelect: (item: HistoryItem) => void;
  onSessionExpired: () => void;
}

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; items: HistoryItem[] };

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const SECONDARY = `min-h-11 cursor-pointer rounded-lg border border-border px-4 text-base font-medium ${FOCUS}`;

function routeLabel(item: HistoryItem): string {
  return `${item.origin} → ${item.destination}`;
}

export function HistoryPanel({ refreshKey, onSelect, onSessionExpired }: Props) {
  const [state, setState] = useState<State>({ status: "loading" });
  const expired = useRef(onSessionExpired);
  expired.current = onSessionExpired;
  const latest = useRef(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey is the refetch trigger
  const load = useCallback(() => {
    const id = ++latest.current;
    setState({ status: "loading" });
    api
      .history()
      .then((r) => {
        if (id === latest.current) setState({ status: "ready", items: r.items });
      })
      .catch((e: unknown) => {
        if (id !== latest.current) return;
        if (e instanceof ApiError && e.status === 401) {
          expired.current();
          return;
        }
        setState({
          status: "error",
          message: e instanceof ApiError ? e.detail : "Что-то пошло не так. Попробуйте ещё раз.",
        });
      });
  }, [refreshKey]);

  useEffect(() => {
    load();
    return () => {
      latest.current++;
    };
  }, [load]);

  return (
    <section aria-labelledby="history-title" className="grid gap-3">
      <h2 id="history-title" className="text-lg font-semibold">
        История расчётов
      </h2>
      {state.status === "loading" ? <div className="skeleton" aria-busy="true" /> : null}
      {state.status === "error" ? (
        <div role="alert" className="grid justify-items-start gap-3">
          <p>{state.message}</p>
          <button type="button" onClick={load} className={SECONDARY}>
            Повторить
          </button>
        </div>
      ) : null}
      {state.status === "ready" && state.items.length === 0 ? (
        <p className="text-sm text-muted">
          Пока нет расчётов. Рассчитайте первый — он появится здесь.
        </p>
      ) : null}
      {state.status === "ready" && state.items.length > 0 ? (
        <>
          <table className="hidden w-full border-collapse text-sm md:table">
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <th className="py-2 pr-3 font-medium">Маршрут</th>
                <th className="py-2 pr-3 font-medium">Дата вылета</th>
                <th className="py-2 pr-3 text-right font-medium">Цена</th>
                <th className="py-2 pr-3 text-right font-medium">Желают</th>
                <th className="py-2 pr-3 text-right font-medium">Купят</th>
                <th className="py-2 font-medium">Расчёт</th>
              </tr>
            </thead>
            <tbody>
              {state.items.map((item) => (
                <tr key={item.id} className="border-b border-border tabular-nums">
                  <td className="py-1 pr-3">
                    <button
                      type="button"
                      onClick={() => onSelect(item)}
                      className={`min-h-11 cursor-pointer text-left font-medium text-accent underline-offset-2 hover:underline ${FOCUS}`}
                    >
                      {routeLabel(item)}
                    </button>
                  </td>
                  <td className="py-1 pr-3">{formatDate(item.date)}</td>
                  <td className="py-1 pr-3 text-right">{formatRub(item.price)}</td>
                  <td className="py-1 pr-3 text-right">{formatInt(displayWants(item.wants))}</td>
                  <td className="py-1 pr-3 text-right">{formatInt(item.buys)}</td>
                  <td className="py-1 text-muted">{formatDateTime(item.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="grid gap-2 md:hidden">
            {state.items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onSelect(item)}
                  className={`grid min-h-11 w-full cursor-pointer gap-1 rounded-xl border border-border bg-surface p-3 text-left ${FOCUS}`}
                >
                  <span className="font-medium">{routeLabel(item)}</span>
                  <span className="text-sm text-muted">
                    {formatDate(item.date)} · {formatRub(item.price)}
                  </span>
                  <span className="text-sm tabular-nums">
                    Желают {formatInt(displayWants(item.wants))} · купят {formatInt(item.buys)}
                  </span>
                  <span className="text-xs text-muted">{formatDateTime(item.created_at)}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
