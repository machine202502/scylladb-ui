import {
  baseCqlTypeName,
  cqlLiteralFromDbValue,
  cqlLiteralFromVisualRaw,
  isComplexCqlTypeName,
  quoteCqlIdent,
} from "./cqlRecordModel";

/** Escape a CQL string literal (single quotes doubled). */
export function escapeCqlString(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

/** True if type needs manual CQL literal (collections, UDT, tuple). */
export function isComplexCqlType(cqlType: string): boolean {
  return isComplexCqlTypeName(cqlType);
}

export function baseCqlType(cqlType: string): string {
  return baseCqlTypeName(cqlType);
}

export function valueToCqlLiteral(value: unknown, cqlType: string): string {
  return cqlLiteralFromDbValue(value, cqlType);
}

export function cqlLiteralFromFormField(raw: string, cqlType: string): string {
  return cqlLiteralFromVisualRaw(raw, cqlType);
}

export { quoteCqlIdent };
