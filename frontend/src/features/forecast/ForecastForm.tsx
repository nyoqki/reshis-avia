import { type FormEvent, useEffect, useState } from "react";

import type { ForecastRequest, RoutesResponse } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { Field } from "../../components/ui/Field";
import { DateInput, Input, Select } from "../../components/ui/inputs";
import { formatRub, formatRubRange } from "../../lib/format";

interface Props {
  routes: RoutesResponse;
  value: ForecastRequest;
  onChange: (v: ForecastRequest) => void;
  onSubmit: () => void;
  pending: boolean;
  errors: Record<string, string>;
}

export function ForecastForm({ routes, value, onChange, onSubmit, pending, errors }: Props) {
  const [priceText, setPriceText] = useState(String(value.price));

  // Keep the draft in step with external changes (the «Подставить» button).
  useEffect(() => {
    setPriceText((text) => (Number(text) === value.price ? text : String(value.price)));
  }, [value.price]);

  const route = routes.routes.find((r) => r.destination === value.destination);
  // The API accepts a price outside the route's range (a warning, not an error), so the hint itself
  // turns into the warning, right where the price is typed.
  const outOfRange =
    route !== undefined &&
    value.price > 0 &&
    (value.price < route.price_min || value.price > route.price_max);
  const rangeText = route
    ? `${formatRubRange(route.price_min, route.price_max)}, базовая цена ${formatRub(route.base_price)}`
    : undefined;
  const hint = rangeText && !outOfRange ? `Диапазон маршрута: ${rangeText}` : undefined;
  const warning = rangeText && outOfRange ? `Цена вне диапазона маршрута: ${rangeText}` : undefined;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!pending) onSubmit();
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="grid gap-4 rounded-board border border-line bg-paper-raised p-5"
    >
      <Field id="forecast-origin" label="Город вылета">
        {(control) => <Input {...control} type="text" value={routes.origin} readOnly />}
      </Field>

      <Field id="forecast-destination" label="Куда" error={errors.destination}>
        {(control) => (
          <Select
            {...control}
            value={value.destination}
            onChange={(e) => onChange({ ...value, destination: e.target.value })}
          >
            {routes.routes.map((r) => (
              <option key={r.code} value={r.destination}>
                {r.destination}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field id="forecast-date" label="Дата вылета" error={errors.date}>
        {(control) => (
          <DateInput
            {...control}
            value={value.date}
            min={routes.date_min}
            max={routes.date_max}
            required
            onChange={(e) => onChange({ ...value, date: e.target.value })}
          />
        )}
      </Field>

      <Field
        id="forecast-price"
        label="Цена билета, ₽"
        error={errors.price}
        hint={hint}
        warning={warning}
      >
        {(control) => (
          <Input
            {...control}
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
          />
        )}
      </Field>

      <Button type="submit" variant="primary" block loading={pending} loadingLabel="Считаем…">
        Рассчитать
      </Button>
    </form>
  );
}
