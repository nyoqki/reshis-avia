import { type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from "react";

export interface TermHintProps {
  term: string;
  children: ReactNode;
  surface?: "paper" | "board";
}

const BUTTON: Record<"paper" | "board", string> = {
  paper: "border-line-strong text-ink-2 hover:bg-paper-sunken active:bg-line",
  board: "border-board-line text-board-ink-2 hover:bg-flap-hi active:bg-board-line",
};

const PANEL: Record<"paper" | "board", string> = {
  paper: "border-line-strong bg-paper-raised text-ink",
  board: "border-board-line bg-flap text-board-ink",
};

const EDGE_PX = 8;

/** A transparent 44 px square centred on the 24 px button, so a tap that lands near it still counts. */
const HIT_AREA =
  "after:absolute after:left-1/2 after:top-1/2 after:size-11 after:-translate-x-1/2 after:-translate-y-1/2";

/**
 * Round «?» button that discloses a short explanation of a term. The panel exists
 * only while open. A second click or a pointerdown outside closes it; so does Escape,
 * which returns focus to the button only when focus was inside the hint, so it never
 * pulls focus out of a field the user has moved to. The 24 px button has a 44 px hit area.
 */
export function TermHint({ term, children, surface = "paper" }: TermHintProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const inside = rootRef.current?.contains(document.activeElement) ?? false;
      setOpen(false);
      if (inside) buttonRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Keep the panel inside the viewport: shift it left or right if it would overflow.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!open || !panel) return;
    panel.style.transform = "";
    const rect = panel.getBoundingClientRect();
    const viewport = document.documentElement.clientWidth;
    if (rect.width === 0) return;
    let shift = 0;
    if (rect.right > viewport - EDGE_PX) shift = viewport - EDGE_PX - rect.right;
    if (rect.left + shift < EDGE_PX) shift = EDGE_PX - rect.left;
    if (shift !== 0) panel.style.transform = `translateX(${shift}px)`;
  }, [open]);

  return (
    <span ref={rootRef} className="relative inline-flex align-middle">
      <button
        ref={buttonRef}
        type="button"
        aria-label={`Что значит «${term}»`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className={`relative inline-flex size-6 items-center justify-center rounded-control border ${HIT_AREA} ${BUTTON[surface]}`}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          width="12"
          height="12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5.75 6a2.25 2.25 0 1 1 3.4 1.93C8.5 8.3 8 8.75 8 9.5" />
          <path d="M8 12v.01" />
        </svg>
      </button>
      {open ? (
        <div
          ref={panelRef}
          id={panelId}
          style={{ width: "min(16rem, calc(100vw - 1rem))" }}
          className={`absolute left-0 top-full z-10 mt-2 rounded-control border px-3 py-2 text-sm font-normal ${PANEL[surface]}`}
        >
          {children}
        </div>
      ) : null}
    </span>
  );
}
