import type { InputHTMLAttributes, Ref, SelectHTMLAttributes } from "react";

const BASE =
  "min-h-11 w-full rounded-control border border-line-strong bg-paper-raised px-3 py-2 text-base text-ink " +
  "disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-danger";
/**
 * Text-like inputs only: `:read-only` also matches every <select>, which is never read-only. The
 * secondary ink matters in the dark theme, where the sunken paper alone reads as an input well.
 */
const TEXT = `${BASE} read-only:bg-paper-sunken read-only:text-ink-2`;

function join(className: string | undefined, base = TEXT) {
  return className ? `${base} ${className}` : base;
}

/** Text-like input. Pair with Field; `readOnly` uses the sunken paper. */
export function Input({
  className,
  ref,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return <input {...rest} ref={ref} className={join(className)} />;
}

/** Native select. Pair with Field. */
export function Select({
  className,
  ref,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { ref?: Ref<HTMLSelectElement> }) {
  return <select {...rest} ref={ref} className={join(className, BASE)} />;
}

/** Native date input (`type="date"`, value as YYYY-MM-DD). Pair with Field. */
export function DateInput({
  className,
  ref,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  ref?: Ref<HTMLInputElement>;
}) {
  return <input {...rest} ref={ref} type="date" className={join(className)} />;
}
