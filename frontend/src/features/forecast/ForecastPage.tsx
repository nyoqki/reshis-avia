import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { ApiError, api } from "../../api/client";
import type {
  ForecastRequest,
  ForecastResponse,
  HistoryItem,
  RoutesResponse,
} from "../../api/types";
import { Board } from "../../components/board/Board";
import { FlapText } from "../../components/board/FlapText";
import { Notice } from "../../components/ui/Notice";
import { Skeleton } from "../../components/ui/Skeleton";
import { displayWants, formatInt, formatRub } from "../../lib/format";
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

// The API takes whole rubles in this range (backend schemas.py); the form says so before sending.
const MAX_PRICE = 1_000_000;
const PRICE_RULE = `Укажите цену в\u00a0целых рублях: от\u00a01 до\u00a0${formatRub(MAX_PRICE)}`;
const FAILED = "Что-то пошло не\u00a0так. Попробуйте ещё раз.";

function waitMessage(retryAfter: number | null): string {
  if (retryAfter === null)
    return "Слишком много запросов. Подождите немного и\u00a0попробуйте снова.";
  if (retryAfter < 120) {
    return `Слишком много запросов. Подождите ${Math.max(1, retryAfter)}\u00a0сек и\u00a0попробуйте снова.`;
  }
  return `Слишком много запросов. Подождите ${Math.ceil(retryAfter / 60)}\u00a0мин и\u00a0попробуйте снова.`;
}

interface StoredResult {
  response: ForecastResponse;
  // The price taken from the recommendation for this very result, or null after a regular submit.
  substitutedPrice: number | null;
}

// Before the first calculation the board says what to do, then shows one status row, where the
// result board's status will flip in. Rows of blank cells read as a loading skeleton.
const EMPTY_PROMPT =
  "Выберите маршрут, дату и\u00a0цену, затем нажмите «Рассчитать»: здесь появится табло с\u00a0прогнозом.";
const EMPTY_STATUS = "ЖДЁМ РАСЧЁТ";

function announcement(result: ForecastResponse, substitutedPrice: number | null): string {
  const prefix =
    substitutedPrice === null
      ? ""
      : `Подставлена рекомендуемая цена ${formatRub(substitutedPrice)}. `;
  return `${prefix}Прогноз готов. Желают купить: ${formatInt(displayWants(result.wants))}, купят: ${formatInt(result.buys)}, мест в самолёте: ${formatInt(result.seats)}.`;
}

function mediaMatches(query: string): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(query).matches;
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
  const [stored, setStored] = useState<StoredResult | null>(null);
  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const result = stored?.response ?? null;
  const substitutedPrice = stored?.substitutedPrice ?? null;
  const inFlight = useRef(false);
  const formArea = useRef<HTMLDivElement>(null);
  const resultArea = useRef<HTMLDivElement>(null);
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
          message: e instanceof ApiError ? e.detail : FAILED,
        });
      });
  }, []);

  useEffect(() => {
    loadRoutes();
  }, [loadRoutes]);

  // On a phone the form sits above the result, so a new result lands off-screen and the tap on
  // «Рассчитать» seems to do nothing: bring the numbers into view. Where the result already starts near
  // the top (beside the form on a wide screen) nothing moves. refreshKey grows only on success.
  useEffect(() => {
    const area = resultArea.current;
    // After «Подставить» the result is already on screen and focus sits on that button.
    if (refreshKey === 0 || !area || substitutedPrice !== null) return;
    const { top } = area.getBoundingClientRect();
    if (top >= 0 && top <= window.innerHeight / 3) return;
    const behavior = mediaMatches("(prefers-reduced-motion: reduce)") ? "auto" : "smooth";
    area.scrollIntoView?.({ behavior, block: "start" });
  }, [refreshKey, substitutedPrice]);

  async function submit(override?: ForecastRequest, opts?: { substituted?: boolean }) {
    const request = override ?? value;
    if (inFlight.current || !request) return;
    // An empty field arrives as 0, and the input does not stop fractions: answer here, in words, and
    // move focus to the field once the message is in the DOM, so a screen reader reads them together.
    if (!Number.isInteger(request.price) || request.price < 1 || request.price > MAX_PRICE) {
      flushSync(() => {
        setFieldErrors({ price: PRICE_RULE });
        setFormError(null);
      });
      formArea.current?.querySelector<HTMLElement>("#forecast-price")?.focus();
      return;
    }
    inFlight.current = true;
    setPending(true);
    setFieldErrors({});
    setFormError(null);
    try {
      const response = await api.forecast(request);
      if (alive.current) {
        setStored({ response, substitutedPrice: opts?.substituted ? request.price : null });
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
        setFormError(e instanceof ApiError ? e.detail : FAILED);
      }
    } finally {
      inFlight.current = false;
      if (alive.current) setPending(false);
    }
  }

  function applyRecommended(price: number) {
    if (!value) return;
    const next = { ...value, price };
    setValue(next);
    void submit(next, { substituted: true });
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
    return <Skeleton />;
  }

  if (state.status === "error") {
    return (
      <Notice tone="error" onRetry={loadRoutes}>
        {state.message}
      </Notice>
    );
  }

  if (!value) return null;

  const canRetry =
    formError !== null &&
    !formError.startsWith("Слишком много запросов") &&
    Object.keys(fieldErrors).length === 0;

  return (
    <div className="grid gap-6">
      <p role="status" className="sr-only">
        {result ? announcement(result, substitutedPrice) : ""}
      </p>
      <div className="grid gap-6 lg:grid-cols-[var(--size-form)_minmax(0,1fr)] lg:items-start">
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
            <Notice tone="error" onRetry={canRetry ? () => void submit() : undefined}>
              {formError}
            </Notice>
          ) : null}
        </div>
        <div ref={resultArea} className="min-w-0 scroll-mt-4">
          {result ? (
            <ResultPanel result={result} onUseRecommended={applyRecommended} pending={pending} />
          ) : (
            <Board as="section" aria-label="Табло прогноза">
              <div className="grid gap-4">
                <p className="text-base text-board-ink-2">{EMPTY_PROMPT}</p>
                {/* decoration: the sentence above already says it */}
                <div aria-hidden="true">
                  <FlapText text={EMPTY_STATUS} size="fit" />
                </div>
              </div>
            </Board>
          )}
        </div>
      </div>
      {result ? <ScenarioChart result={result} /> : null}
      <HistoryPanel
        refreshKey={refreshKey}
        onSelect={selectHistory}
        onSessionExpired={onSessionExpired}
      />
    </div>
  );
}
