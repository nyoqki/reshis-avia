import { type FormEvent, useEffect, useState } from "react";

import type { ForecastRequest, RoutesResponse } from "../../api/types";
import { formatInt, formatRub } from "../../lib/format";

interface Props {
  routes: RoutesResponse;
  value: ForecastRequest;
  onChange: (v: ForecastRequest) => void;
  onSubmit: () => void;
  pending: boolean;
  errors: Record<string, string>;
}

const INPUT =
  "min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent aria-[invalid=true]:border-danger";

function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint ? <p className="text-sm text-muted">{hint}</p> : null}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function ForecastForm({ routes, value, onChange, onSubmit, pending, errors }: Props) {
  const [priceText, setPriceText] = useState(String(value.price));

  // Keep the draft in step with external changes (the «Подставить» button).
  useEffect(() => {
    setPriceText((text) => (Number(text) === value.price ? text : String(value.price)));
  }, [value.price]);

  const route = routes.routes.find((r) => r.destination === value.destination);
  const hint = route
    ? `Диапазон маршрута: ${formatInt(route.price_min)}–${formatRub(route.price_max)}, базовая цена ${formatRub(route.base_price)}`
    : undefined;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!pending) onSubmit();
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="grid gap-4 rounded-xl border border-border bg-surface p-5"
    >
      <Field id="forecast-origin" label="Откуда">
        <input
          id="forecast-origin"
          type="text"
          value={routes.origin}
          readOnly
          className={`${INPUT} text-muted`}
        />
      </Field>

      <Field id="forecast-destination" label="Куда" error={errors.destination}>
        <select
          id="forecast-destination"
          value={value.destination}
          onChange={(e) => onChange({ ...value, destination: e.target.value })}
          aria-invalid={errors.destination ? true : undefined}
          aria-describedby={errors.destination ? "forecast-destination-error" : undefined}
          className={INPUT}
        >
          {routes.routes.map((r) => (
            <option key={r.code} value={r.destination}>
              {r.destination}
            </option>
          ))}
        </select>
      </Field>

      <Field id="forecast-date" label="Дата вылета" error={errors.date}>
        <input
          id="forecast-date"
          type="date"
          value={value.date}
          min={routes.date_min}
          max={routes.date_max}
          required
          onChange={(e) => onChange({ ...value, date: e.target.value })}
          aria-invalid={errors.date ? true : undefined}
          aria-describedby={errors.date ? "forecast-date-error" : undefined}
          className={INPUT}
        />
      </Field>

      <Field id="forecast-price" label="Цена билета, ₽" error={errors.price} hint={hint}>
        <input
          id="forecast-price"
          type="number"
          inputMode="numeric"
          step={1}
          min={1}
          required
          value={priceText}
          onChange={(e) => {
            setPriceText(e.target.value);
            const n = Number(e.target.value);
            onChange({ ...value, price: e.target.value === "" || !Number.isFinite(n) ? 0 : n });
          }}
          aria-invalid={errors.price ? true : undefined}
          aria-describedby={errors.price ? "forecast-price-error" : undefined}
          className={INPUT}
        />
      </Field>

      <button
        type="submit"
        disabled={pending}
        className="min-h-11 w-full cursor-pointer rounded-lg bg-accent px-4 text-base font-semibold text-(--accent-text) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Считаем…" : "Рассчитать"}
      </button>
    </form>
  );
}
