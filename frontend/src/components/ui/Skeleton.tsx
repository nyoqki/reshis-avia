export interface SkeletonProps {
  variant?: "paper" | "board";
  rows?: number;
  className?: string;
}

/**
 * Loading placeholder. `board` draws rows of blank flap cells for the dark board.
 * The pulse changes opacity only and is off under reduced motion.
 */
export function Skeleton({ variant = "paper", rows = 3, className }: SkeletonProps) {
  const classes = ["skeleton", className ?? ""].filter(Boolean).join(" ");
  if (variant === "board") {
    const rowKeys = Array.from({ length: rows }, (_, i) => `row-${i}`);
    return (
      <div aria-busy="true" className={`${classes} flex flex-col gap-2`}>
        {rowKeys.map((key) => (
          <div
            key={key}
            aria-hidden="true"
            className="h-8 rounded-cell border border-board-line bg-flap motion-safe:animate-pulse"
          />
        ))}
      </div>
    );
  }
  return <div aria-busy="true" className={classes} />;
}
