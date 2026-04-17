import { baseCqlType, isComplexCqlType } from "../utils/feature/scylla/cqlDataLiteral.utils";
import { formatTimestampCell } from "../utils/feature/scylla/formatTimestamp.utils";
import { formatCell } from "../utils/formatCell";

type Props = {
  value: unknown;
  cqlType?: string;
  showEmptyMarker?: boolean;
};

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_RX = /^\d{2}\.\d{2}\.\d{4}(?:[ ,]\d{2}:\d{2}(?::\d{2})?)?$/;

/** Staged/editor values are strings; DB driver returns numbers. Same CQL type → same visuals. */
const NUMERIC_BASE_TYPES = new Set([
  "int",
  "bigint",
  "smallint",
  "tinyint",
  "float",
  "double",
  "decimal",
  "varint",
  "counter",
]);

function escapeQuotedText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function CellValue({ value, cqlType, showEmptyMarker = false }: Props) {
  if (value == null) return <span className="dataTable__null">NULL</span>;

  if (typeof value === "boolean") {
    return <span className="dataTable__value dataTable__value--number">{String(value)}</span>;
  }

  if (typeof value === "number") {
    return <span className="dataTable__value dataTable__value--number">{formatCell(value)}</span>;
  }

  if (typeof value === "object") {
    return <span className="dataTable__value dataTable__value--json">{formatCell(value)}</span>;
  }

  if (typeof value === "string" && cqlType) {
    const baseType = baseCqlType(cqlType);
    if (NUMERIC_BASE_TYPES.has(baseType)) {
      const s = value.trim();
      if (showEmptyMarker && s === "") {
        return <span className="dataTable__value dataTable__value--empty">{"\u2014"}</span>;
      }
      if (s === "") {
        return <span className="dataTable__value dataTable__value--empty">{"\u2014"}</span>;
      }
      if (baseType === "varint" || baseType === "decimal") {
        return <span className="dataTable__value dataTable__value--number">{s}</span>;
      }
      const n = Number(s);
      if (Number.isFinite(n)) {
        return <span className="dataTable__value dataTable__value--number">{formatCell(n)}</span>;
      }
      return <span className="dataTable__value dataTable__value--number">{s}</span>;
    }
    if (baseType === "boolean") {
      const lo = value.trim().toLowerCase();
      if (lo === "true" || lo === "false") {
        return <span className="dataTable__value dataTable__value--number">{lo}</span>;
      }
    }
    if (isComplexCqlType(cqlType)) {
      const s = value.trim();
      if (showEmptyMarker && s === "") {
        return <span className="dataTable__value dataTable__value--empty">{"\u2014"}</span>;
      }
      if (s === "") {
        return <span className="dataTable__value dataTable__value--empty">{"\u2014"}</span>;
      }
      try {
        const parsed = JSON.parse(s);
        return <span className="dataTable__value dataTable__value--json">{formatCell(parsed)}</span>;
      } catch {
        return (
          <span className="dataTable__value dataTable__value--invalidJson" title={s}>
            Invalid JSON
          </span>
        );
      }
    }
  }

  const text = String(value);
  if (showEmptyMarker && text.trim() === "") {
    return <span className="dataTable__value dataTable__value--empty">{"\u2014"}</span>;
  }

  const baseType = cqlType ? baseCqlType(cqlType) : "";
  if (baseType === "timestamp" || baseType === "date" || baseType === "time") {
    const pretty = formatTimestampCell(text);
    if (pretty) return <span className="dataTable__value dataTable__value--date">{pretty}</span>;
  }
  if (baseType === "uuid" || baseType === "timeuuid" || UUID_RX.test(text)) {
    return <span className="dataTable__value dataTable__value--uuid">{text}</span>;
  }
  if (DATE_RX.test(text)) {
    return <span className="dataTable__value dataTable__value--date">{text}</span>;
  }

  return <span className="dataTable__value dataTable__value--text">{`"${escapeQuotedText(text)}"`}</span>;
}

