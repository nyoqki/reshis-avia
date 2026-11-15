import { Board } from "../../components/board/Board";
import { FlapNumber } from "../../components/board/FlapNumber";
import { FlapText } from "../../components/board/FlapText";
import { DataTable, type DataTableColumn } from "../../components/ui/DataTable";
import { DEPARTURES, type Departure } from "./departures";

const COLUMNS: DataTableColumn<Departure>[] = [
  {
    key: "city",
    header: "Куда",
    rowHeader: true,
    render: (d) => <span className="text-base font-medium sm:text-lg">{d.city}</span>,
  },
  {
    key: "code",
    header: "Код",
    render: (d) => <FlapText text={d.code} size="fit" />,
  },
  {
    key: "price",
    header: "Базовая цена, ₽",
    align: "end",
    render: (d) => <FlapNumber value={d.basePrice} size="fit" />,
  },
];

export function DeparturesBoard() {
  return (
    <Board aria-labelledby="departures-title">
      <h2 id="departures-title" className="text-lg font-medium">
        Направления из Москвы
      </h2>
      <p className="mb-3 text-sm text-board-ink-2">Прогноз на 01.06–01.07.2026</p>
      <DataTable
        variant="board"
        columns={COLUMNS}
        rows={DEPARTURES}
        rowKey={(d) => d.route}
        rowProps={(_, i) => ({
          "data-row-flip": "",
          style: { "--row": i } as React.CSSProperties,
        })}
      />
    </Board>
  );
}
