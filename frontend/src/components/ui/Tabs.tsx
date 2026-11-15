import { type KeyboardEvent, type ReactNode, useRef } from "react";

export interface TabItem<T extends string> {
  id: T;
  label: string;
}

export interface TabsProps<T extends string> {
  tabs: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  idPrefix: string;
  label?: string;
  children: ReactNode;
}

/**
 * Tabs with one shared panel. Arrow keys, Home and End move focus and activate
 * the tab; only the active tab is in the tab order.
 */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  idPrefix,
  label,
  children,
}: TabsProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function onKeyDown(event: KeyboardEvent, index: number) {
    let next: number;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    const tab = tabs[next];
    if (!tab) return;
    onChange(tab.id);
    refs.current[next]?.focus();
  }

  return (
    <div>
      <div role="tablist" aria-label={label} className="flex border-b border-line-strong">
        {tabs.map((tab, index) => {
          const active = tab.id === value;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                refs.current[index] = el;
              }}
              type="button"
              role="tab"
              id={`${idPrefix}-tab-${tab.id}`}
              aria-selected={active}
              aria-controls={`${idPrefix}-panel`}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(tab.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={[
                "min-h-11 border-b-4 px-4 py-2 text-base focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2",
                active
                  ? "border-b-ink font-medium text-ink"
                  : "border-b-transparent text-ink-2 hover:bg-paper-sunken active:bg-line",
              ].join(" ")}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id={`${idPrefix}-panel`} aria-labelledby={`${idPrefix}-tab-${value}`}>
        {children}
      </div>
    </div>
  );
}
