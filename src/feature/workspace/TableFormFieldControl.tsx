import { baseCqlType, isComplexCqlType } from "../../utils/feature/scylla/cqlDataLiteral.utils";

export type FormCellValue = string | null;

type Props = {
  cqlType: string;
  value: FormCellValue;
  disabled: boolean;
  onChange: (next: string) => void;
  onSetNull: () => void;
  onGenerate: () => void;
  onNow: () => void;
};

const nullInputStyle = {
  fontStyle: "italic",
  opacity: 0.8,
  borderStyle: "dashed",
  background: "rgba(255, 235, 59, 0.10)",
} as const;

export function TableFormFieldControl({
  cqlType,
  value,
  disabled,
  onChange,
  onSetNull,
  onGenerate,
  onNow,
}: Props) {
  const b = baseCqlType(cqlType);
  const isNull = value == null;
  const isComplex = isComplexCqlType(cqlType);
  const canGenerate = b === "uuid" || b === "timeuuid";
  const canNow = b === "timestamp" || b === "date" || b === "time";

  return (
    <div className="tableDataCrud__fieldRow">
      {isComplex ? (
        <textarea
          className={`tableDataCrud__textarea${isNull ? " tableDataCrud__textarea--null" : ""}`}
          style={isNull ? nullInputStyle : undefined}
          rows={4}
          value={value ?? ""}
          placeholder={isNull ? "NULL" : ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          spellCheck={false}
        />
      ) : (
        <input
          type="text"
          className={`tableDataCrud__input${isNull ? " tableDataCrud__input--null" : ""}`}
          style={isNull ? nullInputStyle : undefined}
          value={value ?? ""}
          placeholder={isNull ? "NULL" : ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      )}
      {canGenerate && (
        <button type="button" className="tableDataCrud__miniBtn" disabled={disabled} onClick={onGenerate}>
          Generate
        </button>
      )}
      {canNow && (
        <button type="button" className="tableDataCrud__miniBtn" disabled={disabled} onClick={onNow}>
          Now
        </button>
      )}
      <button type="button" className="tableDataCrud__miniBtn" disabled={disabled} onClick={onSetNull}>
        Null
      </button>
    </div>
  );
}

