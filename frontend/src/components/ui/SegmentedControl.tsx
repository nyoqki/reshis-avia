import type { ReactNode } from "react";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

export interface SegmentedControlProps<T extends string> {
  name: string;
  legend: string;
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  legendVisible?: boolean;
  compact?: boolean;
}

/**
 * Single choice among a few options, built on native radios. In `compact` mode
 * only the icons show, the labels stay as accessible names. The checked segment
 * is marked by a filled background and a check bar, not by colour alone.
 */
export function SegmentedControl<T extends string>({
  name,
  legend,
  value,
  options,
  onChange,
  legendVisible = false,
  compact = false,
}: SegmentedControlProps<T>) {
  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className={legendVisible ? "mb-2 text-sm text-ink-2" : "sr-only"}>{legend}</legend>
      <div className="inline-flex rounded-control border border-line-strong bg-paper-raised">
        {options.map((option) => {
          const checked = option.value === value;
          return (
            <label
              key={option.value}
              className={[
                "relative inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 px-3 py-2 text-base",
                "has-focus-visible:outline-2 has-focus-visible:outline-focus has-focus-visible:outline-offset-2",
                checked
                  ? "bg-paper-sunken font-medium text-ink border-b-4 border-b-ink"
                  : "text-ink-2 hover:bg-paper-sunken",
              ].join(" ")}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={checked}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              {option.icon}
              {compact && option.icon ? (
                <span className="sr-only">{option.label}</span>
              ) : (
                option.label
              )}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
