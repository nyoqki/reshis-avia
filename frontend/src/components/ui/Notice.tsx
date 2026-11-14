import type { ReactNode } from "react";
import { Button } from "./Button";

export interface NoticeProps {
  tone: "info" | "warning" | "error";
  surface?: "paper" | "board";
  role?: "alert" | "status";
  onRetry?: () => void;
  retryLabel?: string;
  children: ReactNode;
  className?: string;
}

const TONE: Record<"paper" | "board", Record<NoticeProps["tone"], string>> = {
  paper: {
    info: "border-line-strong bg-paper-raised text-ink",
    warning: "border-warning bg-paper-raised text-ink",
    error: "border-danger bg-paper-raised text-ink",
  },
  board: {
    info: "border-board-line bg-flap text-board-ink",
    warning: "border-board-warning bg-flap text-board-ink",
    error: "border-board-danger bg-flap text-board-ink",
  },
};

const ICON_COLOUR: Record<"paper" | "board", Record<NoticeProps["tone"], string>> = {
  paper: { info: "text-ink-2", warning: "text-warning", error: "text-danger" },
  board: { info: "text-board-ink-2", warning: "text-board-warning", error: "text-board-danger" },
};

function Icon({ tone }: { tone: NoticeProps["tone"] }) {
  const path =
    tone === "info"
      ? "M12 8v.01M12 11v5"
      : tone === "warning"
        ? "M12 4 3 20h18L12 4Zm0 6v5m0 3v.01"
        : "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-3 6 6 6m0-6-6 6";
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      {tone === "info" ? <circle cx="12" cy="12" r="9" /> : null}
      <path d={path} />
    </svg>
  );
}

/**
 * Inline message. Errors are announced (`role="alert"`); pass `onRetry` to offer
 * a retry button. The icon marks the tone besides colour.
 */
export function Notice({
  tone,
  surface = "paper",
  role,
  onRetry,
  retryLabel,
  children,
  className,
}: NoticeProps) {
  const effectiveRole = role ?? (tone === "error" ? "alert" : undefined);
  const classes = [
    "flex items-start gap-3 rounded-control border p-4 text-base",
    TONE[surface][tone],
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div role={effectiveRole} className={classes}>
      <span className={ICON_COLOUR[surface][tone]}>
        <Icon tone={tone} />
      </span>
      <div className="flex-1">{children}</div>
      {onRetry ? (
        <Button variant={surface === "board" ? "board" : "secondary"} size="sm" onClick={onRetry}>
          {retryLabel ?? "Повторить"}
        </Button>
      ) : null}
    </div>
  );
}
