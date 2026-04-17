import type { DataTableProps } from "../types/ui/DataTable.types";
import { CellValue } from "./CellValue";
import "./DataTable.css";

function Cell({ value }: { value: unknown }) {
  return <CellValue value={value} />;
}

export function DataTable({ columns, rows, rightAlignColumns }: DataTableProps) {
  const alignClass = (c: string) =>
    rightAlignColumns?.includes(c) ? "dataTable__cell--right" : undefined;

  return (
    <table className="dataTable">
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c} className={alignClass(c)}>
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {columns.map((c) => (
              <td key={c} className={alignClass(c)}>
                <Cell value={row[c]} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
