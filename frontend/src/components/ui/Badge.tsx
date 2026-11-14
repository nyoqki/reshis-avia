import type { ReactNode } from "react";

export interface BadgeProps {
  tone?: "neutral" | "demo" | "risk";
  surface?: "paper" | "board";
  children: ReactNode;
  className?: string;
}

const TONE: Record<"paper" | "board", Record<NonNullable<BadgeProps["tone"]>, string>> = {
  paper: {
    neutral: "border-line-strong text-ink-2",
    demo: "border-warning text-warning",
    risk: "border-danger text-danger",
  },
  board: {
    neutral: "border-board-line text-board-ink-2",
    demo: "border-board-warning text-board-warning",
    risk: "border-board-danger text-board-danger",
  },
};

/** Small status label. `demo` marks sample data, `risk` marks a risky value. */
export function Badge({ tone = "neutral", surface = "paper", children, className }: BadgeProps) {
  const classes = [
    "inline-flex items-center rounded-control border px-2 py-1 text-axis font-medium",
    TONE[surface][tone],
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return <span className={classes}>{children}</span>;
}
