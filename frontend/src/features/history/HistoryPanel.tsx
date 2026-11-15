import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError, api } from "../../api/client";
import type { HistoryItem } from "../../api/types";
import { Board } from "../../components/board/Board";
import { FlapCell } from "../../components/board/FlapCell";
import { DataTable, type DataTableColumn } from "../../components/ui/DataTable";
import { Notice } from "../../components/ui/Notice";
import { Skeleton } from "../../components/ui/Skeleton";
import { displayWants, formatDate, formatDateTime, formatInt, formatRub } from "../../lib/format";

interface Props {
  refreshKey: number;
  onSelect: (item: HistoryItem) => void;
  onSessionExpired: () => void;
}

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; items: HistoryItem[]; fresh: ReadonlySet<number> };

const BLANK_CELLS = Array.from({ length: 8 }, (_, i) => `blank-${i}`);

function routeLabel(item: HistoryItem): string {
  return `${item.origin} → ${item.destination}`;
}

// A new refreshKey refetches the history; the current list stays on screen meanwhile.
const BUTTON =
  "min-h-11 cursor-pointer text-start font-medium text-board-ink underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-board-focus";

function flipProps(fresh: ReadonlySet<number>, id: number, order: number) {
  return fresh.has(id)
    ? {
        "data-fresh": "true",
        "data-row-flip": "",
        style: { "--row": order } as React.CSSProperties,
      }
    : {};
}

export function HistoryPanel({ refreshKey, onSelect, onSessionExpired }: Props) {
  const [state, setState] = useState<State>({ status: "loading" });
  const expired = useRef(onSessionExpired);
  expired.current = onSessionExpired;
  const latest = useRef(0);
  const seen = useRef<ReadonlySet<number> | null>(null);

  const load = useCallback(() => {
    const id = ++latest.current;
    setState((s) => (s.status === "ready" ? s : { status: "loading" }));
    api
      .history()
      .then((r) => {
        if (id !== latest.current) return;
        const previous = seen.current;
        const fresh = new Set(
          previous ? r.items.filter((i) => !previous.has(i.id)).map((i) => i.id) : [],
        );
        seen.current = new Set(r.items.map((i) => i.id));
        setState({ status: "ready", items: r.items, fresh });
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
  }, []);

  useEffect(() => {
    void refreshKey; // the parent bumps it after each forecast to request a refetch
    load();
    return () => {
      latest.current++;
    };
  }, [load, refreshKey]);

  const columns: DataTableColumn<HistoryItem>[] = [
    {
      key: "route",
      header: "Маршрут",
      rowHeader: true,
      render: (item) => (
        <button type="button" onClick={() => onSelect(item)} className={BUTTON}>
          {routeLabel(item)}
        </button>
      ),
    },
    {
      key: "date",
      header: "Дата вылета",
      render: (item) => formatDate(item.date),
    },
    {
      key: "price",
      header: "Цена",
      numeric: true,
      render: (item) => formatRub(item.price),
    },
    {
      key: "wants",
      header: "Желают",
      numeric: true,
      render: (item) => formatInt(displayWants(item.wants)),
    },
    {
      key: "buys",
      header: "Купят",
      numeric: true,
      render: (item) => formatInt(item.buys),
    },
    {
      key: "time",
      header: "Время",
      className: "text-board-ink-2",
      render: (item) => formatDateTime(item.created_at),
    },
  ];

  return (
    <Board as="section" aria-labelledby="history-title">
      <h2 id="history-title" className="mb-3 text-lg font-medium">
        История расчётов
      </h2>
      {state.status === "loading" ? <Skeleton variant="board" rows={3} /> : null}
      {state.status === "error" ? (
        <Notice tone="error" surface="board" onRetry={load}>
          {state.message}
        </Notice>
      ) : null}
      {state.status === "ready" && state.items.length === 0 ? (
        <div className="grid gap-3">
          <div aria-hidden="true" className="flex gap-1">
            {BLANK_CELLS.map((key) => (
              <FlapCell key={key} char=" " tone="blank" size="sm" />
            ))}
          </div>
          <p className="text-sm text-board-ink-2">
            Пока нет расчётов. Рассчитайте первый — он появится здесь.
          </p>
        </div>
      ) : null}
      {state.status === "ready" && state.items.length > 0 ? (
        <>
          <DataTable
            variant="board"
            className="hidden md:table"
            columns={columns}
            rows={state.items}
            rowKey={(item) => item.id}
            rowProps={(item, i) => flipProps(state.fresh, item.id, i)}
          />
          <ul className="grid gap-2 md:hidden">
            {state.items.map((item, i) => (
              <li
                key={item.id}
                className="rounded-cell border border-board-line"
                {...flipProps(state.fresh, item.id, i)}
              >
                <button
                  type="button"
                  onClick={() => onSelect(item)}
                  className="grid min-h-11 w-full cursor-pointer gap-1 p-3 text-start focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-board-focus"
                >
                  <span className="font-medium">{routeLabel(item)}</span>
                  <span className="text-sm text-board-ink-2">
                    {formatDate(item.date)} · {formatRub(item.price)}
                  </span>
                  <span className="font-mono text-sm tabular-nums">
                    Желают {formatInt(displayWants(item.wants))} · купят {formatInt(item.buys)}
                  </span>
                  <span className="text-xs text-board-ink-2">
                    {formatDateTime(item.created_at)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </Board>
  );
}
