import type { HTMLAttributes, ReactNode } from "react";

export interface DataTableColumn<T> {
  key: string;
  header: string;
  align?: "start" | "end";
  numeric?: boolean;
  rowHeader?: boolean;
  className?: string;
  render: (row: T, index: number) => ReactNode;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string | number;
  variant?: "paper" | "board";
  caption?: string;
  captionVisible?: boolean;
  rowProps?: (
    row: T,
    index: number,
  ) => HTMLAttributes<HTMLTableRowElement> & {
    [key: `data-${string}`]: string | undefined;
  };
  className?: string;
}

const STYLE = {
  paper: {
    text: "text-ink",
    head: "text-ink-2 border-line-strong",
    row: "border-line",
  },
  board: {
    text: "text-board-ink",
    head: "text-board-ink-2 border-board-line",
    row: "border-board-line",
  },
} as const;

/** Token-styled table for paper and board. Header cells get scope=col, a rowHeader column gets scope=row. */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  variant = "paper",
  caption,
  captionVisible = false,
  rowProps,
  className,
}: DataTableProps<T>) {
  const style = STYLE[variant];
  const cellClasses = (column: DataTableColumn<T>) =>
    [
      "px-3 py-2",
      column.align === "end" || column.numeric ? "text-end" : "text-start",
      column.numeric ? "font-mono tabular-nums" : "",
      column.className ?? "",
    ]
      .filter(Boolean)
      .join(" ");
  return (
    <table className={`w-full border-collapse text-sm ${style.text} ${className ?? ""}`.trim()}>
      {caption ? (
        <caption className={captionVisible ? "pb-2 text-start text-sm font-medium" : "sr-only"}>
          {caption}
        </caption>
      ) : null}
      <thead>
        <tr>
          {columns.map((column) => (
            <th
              key={column.key}
              scope="col"
              className={`${cellClasses(column)} border-b font-medium ${style.head}`}
            >
              {column.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={rowKey(row)} {...rowProps?.(row, index)} className={`border-b ${style.row}`}>
            {columns.map((column) =>
              column.rowHeader ? (
                <th key={column.key} scope="row" className={`${cellClasses(column)} font-normal`}>
                  {column.render(row, index)}
                </th>
              ) : (
                <td key={column.key} className={cellClasses(column)}>
                  {column.render(row, index)}
                </td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
