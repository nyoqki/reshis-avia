import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError, api } from "../../api/client";
import type {
  ForecastRequest,
  ForecastResponse,
  HistoryItem,
  RoutesResponse,
} from "../../api/types";
import { displayWants, formatInt } from "../../lib/format";
import { HistoryPanel } from "../history/HistoryPanel";
import { ForecastForm } from "./ForecastForm";
import { ResultPanel } from "./ResultPanel";
import { ScenarioChart } from "./ScenarioChart";

interface Props {
  onSessionExpired: () => void;
}

type RoutesState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; routes: RoutesResponse };

const SECONDARY =
  "min-h-11 cursor-pointer rounded-lg border border-border px-4 text-base font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

function waitMessage(retryAfter: number | null): string {
  if (retryAfter === null) return "Слишком много запросов. Подождите немного и попробуйте снова.";
  if (retryAfter < 120) {
    return `Слишком много запросов. Подождите ${Math.max(1, retryAfter)} сек и попробуйте снова.`;
  }
  return `Слишком много запросов. Подождите ${Math.ceil(retryAfter / 60)} мин и попробуйте снова.`;
}

function announcement(result: ForecastResponse): string {
  return `Прогноз готов. Желают купить: ${formatInt(displayWants(result.wants))}, купят: ${formatInt(result.buys)}, мест в самолёте: ${formatInt(result.seats)}.`;
}

function initialValue(routes: RoutesResponse): ForecastRequest {
  const first = routes.routes[0];
  return {
    origin: routes.origin,
    destination: first?.destination ?? "",
    date: routes.date_min,
    price: first?.base_price ?? 0,
  };
}

export function ForecastPage({ onSessionExpired }: Props) {
  const [state, setState] = useState<RoutesState>({ status: "loading" });
  const [value, setValue] = useState<ForecastRequest | null>(null);
  const [result, setResult] = useState<ForecastResponse | null>(null);
  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const inFlight = useRef(false);
  const formArea = useRef<HTMLDivElement>(null);
  const alive = useRef(true);
  const expired = useRef(onSessionExpired);
  expired.current = onSessionExpired;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const loadRoutes = useCallback(() => {
    setState({ status: "loading" });
    api
      .routes()
      .then((routes) => {
        if (!alive.current) return;
        // A reply without routes must land in the error state, not crash the render.
        if (!Array.isArray(routes?.routes) || routes.routes.length === 0) {
          throw new Error("routes response has no routes");
        }
        const initial = initialValue(routes);
        setValue((v) => v ?? initial);
        setState({ status: "ready", routes });
      })
      .catch((e: unknown) => {
        if (!alive.current) return;
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
    loadRoutes();
  }, [loadRoutes]);

  async function submit() {
    if (inFlight.current || !value) return;
    inFlight.current = true;
    setPending(true);
    setFieldErrors({});
    setFormError(null);
    try {
      const response = await api.forecast(value);
      if (alive.current) {
        setResult(response);
        setRefreshKey((k) => k + 1);
      }
    } catch (e) {
      if (!alive.current) return;
      if (e instanceof ApiError && e.status === 401) {
        expired.current();
      } else if (e instanceof ApiError && e.status === 422) {
        setFieldErrors(e.fields);
        if (Object.keys(e.fields).length === 0) setFormError(e.detail);
      } else if (e instanceof ApiError && e.status === 429) {
        setFormError(waitMessage(e.retryAfter));
      } else {
        setFormError(e instanceof ApiError ? e.detail : "Что-то пошло не так. Попробуйте ещё раз.");
      }
    } finally {
      inFlight.current = false;
      if (alive.current) setPending(false);
    }
  }

  function selectHistory(item: HistoryItem) {
    setValue({
      origin: item.origin,
      destination: item.destination,
      date: item.date,
      price: item.price,
    });
    setFieldErrors({});
    setFormError(null);
    // On a phone the form sits above the history, off-screen: bring it back with focus.
    formArea.current?.querySelector<HTMLElement>("#forecast-destination")?.focus();
  }

  if (state.status === "loading") {
    return <div className="skeleton" aria-busy="true" />;
  }

  if (state.status === "error") {
    return (
      <div role="alert" className="grid justify-items-start gap-3">
        <p>{state.message}</p>
        <button type="button" onClick={loadRoutes} className={SECONDARY}>
          Повторить
        </button>
      </div>
    );
  }

  if (!value) return null;

  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-start">
      <p role="status" className="sr-only">
        {result ? announcement(result) : ""}
      </p>
      <div ref={formArea} className="grid gap-4">
        <ForecastForm
          routes={state.routes}
          value={value}
          onChange={setValue}
          onSubmit={() => void submit()}
          pending={pending}
          errors={fieldErrors}
        />
        {formError ? (
          <div role="alert" className="grid justify-items-start gap-3 text-sm text-danger">
            <p>{formError}</p>
            {!formError.startsWith("Слишком много запросов") &&
            Object.keys(fieldErrors).length === 0 ? (
              <button type="button" onClick={() => void submit()} className={SECONDARY}>
                Повторить
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="grid min-w-0 gap-6">
        {result ? (
          <ResultPanel
            result={result}
            onUseRecommended={(price) => setValue((v) => (v ? { ...v, price } : v))}
          />
        ) : null}
        {result ? <ScenarioChart result={result} /> : null}
        <HistoryPanel
          refreshKey={refreshKey}
          onSelect={selectHistory}
          onSessionExpired={onSessionExpired}
        />
      </div>
    </div>
  );
}
