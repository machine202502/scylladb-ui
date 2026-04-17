import type { FormCellValue } from "../feature/workspace/TableFormFieldControl";
import type { JsonRow } from "../types/scylla/scylla.types";
import { CellValue } from "./CellValue";
import "./VerticalPropertyTable.css";

type Props = {
  columns: string[];
  row: JsonRow;
  highlightedFields?: Set<string>;
  showTypes?: boolean;
  typeByColumn?: Record<string, string>;
  editingColumn?: string | null;
  editingValue?: FormCellValue;
  onEditingValueChange?: (value: FormCellValue) => void;
  onStartEdit?: (column: string) => void;
  onCommitEdit?: (column: string) => void;
  onCancelEdit?: () => void;
};

/** One horizontal result row shown as Property / Value pairs (for wide catalog rows). */
export function VerticalPropertyTable({
  columns,
  row,
  highlightedFields,
  showTypes = false,
  typeByColumn = {},
  editingColumn = null,
  editingValue = null,
  onEditingValueChange,
  onStartEdit,
  onCommitEdit,
  onCancelEdit,
}: Props) {
  return (
    <table className="verticalPropertyTable">
      <thead>
        <tr>
          <th scope="col">Property</th>
          {showTypes ? <th scope="col">Type</th> : null}
          <th scope="col">Value</th>
        </tr>
      </thead>
      <tbody>
        {columns.map((c) => {
          const isEditing = editingColumn === c;
          return (
            <tr key={c} className={highlightedFields?.has(c) ? "verticalPropertyTable__row--changed" : undefined}>
              <th scope="row" className="verticalPropertyTable__name">
                {c}
              </th>
              {showTypes ? <td className="verticalPropertyTable__type">{typeByColumn[c] ?? ""}</td> : null}
              <td
                className="verticalPropertyTable__value"
                onDoubleClick={() => {
                  onStartEdit?.(c);
                }}
              >
                {isEditing ? (
                  <input
                    type="text"
                    className="verticalPropertyTable__input"
                    autoFocus
                    value={editingValue ?? ""}
                    onChange={(e) => onEditingValueChange?.(e.target.value)}
                    onBlur={() => onCommitEdit?.(c)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        onCommitEdit?.(c);
                      }
                      if (e.key === "Escape") {
                        e.preventDefault();
                        onCancelEdit?.();
                      }
                    }}
                  />
                ) : (
                  <CellValue value={row[c]} />
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
