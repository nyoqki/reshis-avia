import type { ReactNode } from "react";

export interface FieldControlProps {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
}

export interface FieldProps {
  id: string;
  label: string;
  hint?: string;
  warning?: string;
  error?: string;
  children: (control: FieldControlProps) => ReactNode;
}

/**
 * Label, control and messages for one form field. The control is a render prop
 * that receives `id`, `aria-describedby` and `aria-invalid`; spread them on an
 * Input, Select or DateInput. A warning does not mark the control invalid.
 */
export function Field({ id, label, hint, warning, error, children }: FieldProps) {
  const hintId = `${id}-hint`;
  const warningId = `${id}-warning`;
  const errorId = `${id}-error`;
  const described = [hint ? hintId : "", warning ? warningId : "", error ? errorId : ""]
    .filter(Boolean)
    .join(" ");
  const control: FieldControlProps = { id };
  if (described) control["aria-describedby"] = described;
  if (error) control["aria-invalid"] = true;
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-base font-medium text-ink">
        {label}
      </label>
      {children(control)}
      {hint ? (
        <p id={hintId} className="text-sm text-ink-2">
          {hint}
        </p>
      ) : null}
      {warning ? (
        <p id={warningId} className="flex items-start gap-2 text-sm text-warning">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mt-1 shrink-0"
          >
            <path d="M12 4 3 20h18L12 4Zm0 6v5m0 3v.01" />
          </svg>
          {warning}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
