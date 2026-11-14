import type { InputHTMLAttributes, Ref, SelectHTMLAttributes } from "react";

const BASE =
  "min-h-11 w-full rounded-control border border-line-strong bg-paper-raised px-3 py-2 text-base text-ink " +
  "read-only:bg-paper-sunken disabled:cursor-not-allowed disabled:opacity-60 " +
  "aria-[invalid=true]:border-danger";

function join(className: string | undefined) {
  return className ? `${BASE} ${className}` : BASE;
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
  return <select {...rest} ref={ref} className={join(className)} />;
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
