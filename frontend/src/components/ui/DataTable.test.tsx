import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DataTable, type DataTableColumn } from "./DataTable";

interface Row {
  id: number;
  name: string;
  price: number;
}

const rows: Row[] = [
  { id: 1, name: "Рейс А", price: 9000 },
  { id: 2, name: "Рейс Б", price: 10000 },
];

const columns: DataTableColumn<Row>[] = [
  { key: "name", header: "Рейс", rowHeader: true, render: (r) => r.name },
  { key: "price", header: "Цена", numeric: true, align: "end", render: (r) => String(r.price) },
];

describe("DataTable", () => {
  it("AC5: renders columnheaders from columns and one row per item in order", () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} caption="Рейсы" />);
    const headers = screen.getAllByRole("columnheader");
    expect(headers.map((h) => h.textContent)).toEqual(["Рейс", "Цена"]);
    for (const h of headers) {
      expect(h).toHaveAttribute("scope", "col");
    }
    const body = screen.getAllByRole("row").slice(1);
    expect(body).toHaveLength(2);
    expect(within(body[0]).getByText("Рейс А")).toBeInTheDocument();
    expect(within(body[1]).getByText("Рейс Б")).toBeInTheDocument();
  });

  it("AC5: a rowHeader column renders a rowheader cell", () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />);
    const rowHeaders = screen.getAllByRole("rowheader");
    expect(rowHeaders.map((h) => h.textContent)).toEqual(["Рейс А", "Рейс Б"]);
    for (const h of rowHeaders) {
      expect(h).toHaveAttribute("scope", "row");
    }
  });

  it("AC5: rowProps data attributes reach the tr; numeric cells carry font-mono", () => {
    render(
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        rowProps={(r) => ({ "data-row-id": String(r.id) })}
      />,
    );
    const body = screen.getAllByRole("row").slice(1);
    expect(body[0]).toHaveAttribute("data-row-id", "1");
    expect(body[1]).toHaveAttribute("data-row-id", "2");
    const cell = screen.getByRole("cell", { name: "9000" });
    expect(cell).toHaveClass("font-mono");
    expect(cell).toHaveClass("tabular-nums");
  });
});
