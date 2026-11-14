import type { HTMLAttributes, ReactNode } from "react";

export interface BoardProps extends HTMLAttributes<HTMLElement> {
  as?: "section" | "div" | "article";
  header?: ReactNode;
}

/**
 * The dark split-flap board, dark in both themes. `header` is a top row above a board rule. The
 * `board` class switches every focus ring inside to the yellow --color-board-focus (board.css).
 */
export function Board({ as: Tag = "section", header, className, children, ...rest }: BoardProps) {
  const classes = [
    "board rounded-board border border-board-edge bg-board text-board-ink",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <Tag {...rest} className={classes}>
      {header != null && <div className="border-b border-board-line px-4 py-3">{header}</div>}
      <div className="p-4">{children}</div>
    </Tag>
  );
}
