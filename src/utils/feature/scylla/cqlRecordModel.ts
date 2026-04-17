import { formatTimestampCell } from "./formatTimestamp.utils";
import { complexLiteralFromParsedJson } from "./cqlComplexSerializer";

/** Empty string is not NULL; only explicit null (Set NULL) is NULL. */
export const EMPTY_FIELD_NOT_VALID_MSG =
  "Empty input is not NULL. Use Set NULL for NULL, or enter a valid value for this type.";

export type CqlVisualValue = {
  kind: "null" | "text" | "number" | "boolean" | "date" | "uuid" | "blob" | "json" | "raw";
  displayText: string;
  editor: { mode: "null" | "scalar"; rawText: string };
};

export type CqlVisualInput = { mode: "null" } | { mode: "scalar"; rawText: string };
export type CqlRecordColumn = { name: string; type: string };

type CqlBaseKind =
  | "boolean"
  | "numeric"
  | "blob"
  | "uuid"
  | "timestamp"
  | "date"
  | "time"
  | "duration"
  | "text"
  | "complex"
  | "json";

function normalizeBaseKind(cqlType: string): CqlBaseKind {
  const raw = cqlType.trim().toLowerCase();
  if (raw.includes("<") || raw.includes("tuple") || raw.includes("udt")) return "complex";

  const unwrapped = raw.startsWith("frozen<") && raw.endsWith(">")
    ? raw.slice("frozen<".length, -1).trim()
    : raw;
  const t = unwrapped.split("<")[0]?.trim() ?? "";

  if (t === "boolean" || t === "bool") return "boolean";
  if (["int", "bigint", "smallint", "tinyint", "double", "float", "varint", "counter", "decimal"].includes(t))
    return "numeric";
  if (t === "blob") return "blob";
  if (t === "uuid" || t === "timeuuid") return "uuid";
  if (t === "timestamp") return "timestamp";
  if (t === "date") return "date";
  if (t === "time") return "time";
  if (t === "duration") return "duration";
  if (["text", "ascii", "varchar", "inet"].includes(t)) return "text";
  throw new Error(`Unsupported CQL type: ${cqlType}`);
}

function escapeCqlString(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

function blobToCqlLiteral(input: string): string {
  const s = input.trim();
  const hex = s.startsWith("0x") || s.startsWith("0X") ? s.slice(2) : s;
  if (!/^[0-9a-fA-F]+$/.test(hex)) throw new Error("Blob must be HEX bytes (example: 0x0A0B or 0A0B)");
  if (hex.length % 2 !== 0) throw new Error("Blob HEX length must be even (2 chars per byte)");
  return `0x${hex}`;
}

function normalizeUuidInput(input: string): string {
  const s = input.trim();
  if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith("\"") && s.endsWith("\""))) return s.slice(1, -1).trim();
  return s;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function dateFromScyllaDays(raw: number): string {
  const days = raw - 2_147_483_648;
  const ms = days * 86_400_000;
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function timeFromNanos(ns: bigint): string {
  const billion = 1_000_000_000n;
  const minuteNs = 60n * billion;
  const hourNs = 60n * minuteNs;
  const h = Number(ns / hourNs);
  const m = Number((ns % hourNs) / minuteNs);
  const s = Number((ns % minuteNs) / billion);
  const frac = Number(ns % billion);
  if (frac === 0) return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}.${String(frac).padStart(9, "0")}`;
}

function durationWrapperToLiteral(raw: string): string | null {
  const m = raw.match(/CqlDuration\s*\{\s*months:\s*(-?\d+),\s*days:\s*(-?\d+),\s*nanoseconds:\s*(-?\d+)\s*\}/i);
  if (!m) return null;
  return `${m[1]}mo${m[2]}d${m[3]}ns`;
}

function isPlainRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function toCqlLiteralForUdtValue(v: unknown): string {
  if (v == null) return "NULL";
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "string") return escapeCqlString(v);
  if (Array.isArray(v)) return `[${v.map((x) => toCqlLiteralForUdtValue(x)).join(", ")}]`;
  if (isPlainRecord(v)) {
    const entries = Object.entries(v).map(([k, val]) => `${escapeCqlString(k)}: ${toCqlLiteralForUdtValue(val)}`);
    return `{${entries.join(", ")}}`;
  }
  return escapeCqlString(String(v));
}

function udtWrapperToLiteral(v: Record<string, unknown>): string | null {
  const fields = v.fields;
  if (!isPlainRecord(fields)) return null;
  const items = Object.entries(fields).map(([k, val]) => `${k}: ${toCqlLiteralForUdtValue(val)}`);
  return `{${items.join(", ")}}`;
}

abstract class CqlValue {
  abstract toCqlLiteral(): string;
  abstract toVisual(): CqlVisualValue;
}

class NullValue extends CqlValue {
  toCqlLiteral(): string {
    return "NULL";
  }
  toVisual(): CqlVisualValue {
    return { kind: "null", displayText: "NULL", editor: { mode: "null", rawText: "" } };
  }
}

class ScalarValue extends CqlValue {
  constructor(
    private readonly kind: CqlVisualValue["kind"],
    private readonly raw: string,
    private readonly toLiteralFn: (raw: string) => string,
    private readonly display = raw,
  ) {
    super();
  }
  toCqlLiteral(): string {
    return this.toLiteralFn(this.raw);
  }
  toVisual(): CqlVisualValue {
    return { kind: this.kind, displayText: this.display, editor: { mode: "scalar", rawText: this.raw } };
  }
}

abstract class CqlTypeCodec {
  constructor(public readonly baseKind: CqlBaseKind) {}
  abstract fromDb(value: unknown): CqlValue;
  abstract fromVisual(input: CqlVisualInput): CqlValue;
}

class BooleanCodec extends CqlTypeCodec {
  constructor() {
    super("boolean");
  }
  fromDb(value: unknown): CqlValue {
    return typeof value === "boolean"
      ? new ScalarValue("boolean", value ? "true" : "false", (x) => x)
      : new NullValue();
  }
  fromVisual(input: CqlVisualInput): CqlValue {
    if (input.mode === "null") return new NullValue();
    const l = input.rawText.trim().toLowerCase();
    if (l === "") throw new Error(EMPTY_FIELD_NOT_VALID_MSG);
    if (l !== "true" && l !== "false") throw new Error("Invalid boolean");
    return new ScalarValue("boolean", l, (x) => x);
  }
}

class NumericCodec extends CqlTypeCodec {
  constructor() {
    super("numeric");
  }
  fromDb(value: unknown): CqlValue {
    if (typeof value === "number" && Number.isFinite(value)) return new ScalarValue("number", String(value), (x) => x);
    if (typeof value === "string" && /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(value.trim())) {
      return new ScalarValue("number", String(Number(value.trim())), (x) => x);
    }
    return new NullValue();
  }
  fromVisual(input: CqlVisualInput): CqlValue {
    if (input.mode === "null") return new NullValue();
    const v = input.rawText.trim();
    if (v === "") throw new Error(EMPTY_FIELD_NOT_VALID_MSG);
    if (!/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(v)) throw new Error("Invalid numeric value");
    return new ScalarValue("number", String(Number(v)), (x) => x);
  }
}

class BlobCodec extends CqlTypeCodec {
  constructor() {
    super("blob");
  }
  fromDb(value: unknown): CqlValue {
    if (value == null) return new NullValue();
    if (typeof value !== "string") {
      throw new Error("Invalid blob value from DB");
    }
    const lit = blobToCqlLiteral(value);
    return new ScalarValue("blob", lit, (x) => x);
  }
  fromVisual(input: CqlVisualInput): CqlValue {
    if (input.mode === "null") return new NullValue();
    if (input.rawText.trim() === "") throw new Error(EMPTY_FIELD_NOT_VALID_MSG);
    const lit = blobToCqlLiteral(input.rawText);
    return new ScalarValue("blob", lit, (x) => x);
  }
}

class UuidCodec extends CqlTypeCodec {
  constructor() {
    super("uuid");
  }
  fromDb(value: unknown): CqlValue {
    const s = normalizeUuidInput(String(value ?? ""));
    if (!s) return new NullValue();
    const uuidMatch = s.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
    if (uuidMatch) return new ScalarValue("uuid", uuidMatch[0], (x) => x);
    if (/^[a-zA-Z_][a-zA-Z0-9_]*\s*\(.*\)$/.test(s)) return new ScalarValue("uuid", s, (x) => x);
    // DB value for UUID column must be UUID-like; never degrade to quoted string.
    return new NullValue();
  }
  fromVisual(input: CqlVisualInput): CqlValue {
    if (input.mode === "null") return new NullValue();
    const s = normalizeUuidInput(input.rawText);
    if (s === "") throw new Error(EMPTY_FIELD_NOT_VALID_MSG);
    if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(s)) {
      return new ScalarValue("uuid", s, (x) => x);
    }
    if (/^[a-zA-Z_][a-zA-Z0-9_]*\s*\(.*\)$/.test(s)) {
      return new ScalarValue("uuid", s, (x) => x);
    }
    throw new Error("Invalid UUID value");
  }
}

class TimestampCodec extends CqlTypeCodec {
  constructor() {
    super("timestamp");
  }
  fromDb(value: unknown): CqlValue {
    if (value == null) return new NullValue();
    const raw = String(value).trim();
    const parsed = new Date(raw);
    const iso = Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString();
    const display = formatTimestampCell(raw) ?? formatTimestampCell(iso) ?? raw;
    return new ScalarValue("date", raw, () => escapeCqlString(iso), display);
  }
  fromVisual(input: CqlVisualInput): CqlValue {
    if (input.mode === "null") return new NullValue();
    const v = input.rawText.trim();
    if (v === "") throw new Error(EMPTY_FIELD_NOT_VALID_MSG);
    const ddmmyyyy = v.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
    if (ddmmyyyy) {
      const d = new Date(Number(ddmmyyyy[3]), Number(ddmmyyyy[2]) - 1, Number(ddmmyyyy[1]), Number(ddmmyyyy[4] ?? "0"), Number(ddmmyyyy[5] ?? "0"), Number(ddmmyyyy[6] ?? "0"));
      if (!Number.isNaN(d.getTime())) return new ScalarValue("date", v, () => escapeCqlString(d.toISOString()), v);
    }
    const d = /^\-?\d+$/.test(v) ? new Date(Number(v)) : new Date(v);
    if (!Number.isNaN(d.getTime())) return new ScalarValue("date", v, () => escapeCqlString(d.toISOString()), v);
    throw new Error("Invalid timestamp value");
  }
}

class DateCodec extends CqlTypeCodec {
  constructor() {
    super("date");
  }
  fromDb(value: unknown): CqlValue {
    if (value == null) return new NullValue();
    if (typeof value === "number" && Number.isFinite(value)) {
      const txt = dateFromScyllaDays(value);
      return new ScalarValue("date", txt, (x) => escapeCqlString(x), txt);
    }
    const v = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return new ScalarValue("date", v, (x) => escapeCqlString(x), v);
    if (/^\d+$/.test(v)) {
      const txt = dateFromScyllaDays(Number(v));
      return new ScalarValue("date", txt, (x) => escapeCqlString(x), txt);
    }
    return new NullValue();
  }
  fromVisual(input: CqlVisualInput): CqlValue {
    if (input.mode === "null") return new NullValue();
    const v = input.rawText.trim();
    if (v === "") throw new Error(EMPTY_FIELD_NOT_VALID_MSG);
    const dm = v.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (dm) {
      const txt = `${dm[3]}-${dm[2]}-${dm[1]}`;
      return new ScalarValue("date", txt, (x) => escapeCqlString(x), txt);
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return new ScalarValue("date", v, (x) => escapeCqlString(x), v);
    if (/^\d+$/.test(v)) {
      const txt = dateFromScyllaDays(Number(v));
      return new ScalarValue("date", txt, (x) => escapeCqlString(x), txt);
    }
    throw new Error("Invalid date value");
  }
}

class TimeCodec extends CqlTypeCodec {
  constructor() {
    super("time");
  }
  fromDb(value: unknown): CqlValue {
    if (value == null) return new NullValue();
    const s = String(value).trim();
    const wrap = s.match(/^CqlTime\((\d+)\)$/i);
    if (wrap) {
      const txt = timeFromNanos(BigInt(wrap[1]));
      return new ScalarValue("date", txt, (x) => escapeCqlString(x), txt);
    }
    if (/^\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?$/.test(s)) {
      return new ScalarValue("date", s, (x) => escapeCqlString(x), s);
    }
    return new NullValue();
  }
  fromVisual(input: CqlVisualInput): CqlValue {
    if (input.mode === "null") return new NullValue();
    const s = input.rawText.trim();
    if (s === "") throw new Error(EMPTY_FIELD_NOT_VALID_MSG);
    const wrap = s.match(/^CqlTime\((\d+)\)$/i);
    if (wrap) {
      const txt = timeFromNanos(BigInt(wrap[1]));
      return new ScalarValue("date", txt, (x) => escapeCqlString(x), txt);
    }
    if (/^\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?$/.test(s)) return new ScalarValue("date", s, (x) => escapeCqlString(x), s);
    if (/^\d+$/.test(s)) {
      const txt = timeFromNanos(BigInt(s));
      return new ScalarValue("date", txt, (x) => escapeCqlString(x), txt);
    }
    throw new Error("Invalid time value");
  }
}

class DurationCodec extends CqlTypeCodec {
  constructor() {
    super("duration");
  }
  fromDb(value: unknown): CqlValue {
    if (value == null) return new NullValue();
    const s = String(value).trim();
    const lit = durationWrapperToLiteral(s) ?? s;
    if (/^-?\d+mo-?\d+d-?\d+ns$/i.test(lit) || /^P/i.test(lit)) {
      return new ScalarValue("raw", lit, (x) => x, lit);
    }
    return new NullValue();
  }
  fromVisual(input: CqlVisualInput): CqlValue {
    if (input.mode === "null") return new NullValue();
    const s = input.rawText.trim();
    if (s === "") throw new Error(EMPTY_FIELD_NOT_VALID_MSG);
    const lit = durationWrapperToLiteral(s) ?? s;
    if (/^-?\d+mo-?\d+d-?\d+ns$/i.test(lit) || /^P/i.test(lit)) {
      return new ScalarValue("raw", lit, (x) => x, lit);
    }
    throw new Error("Invalid duration value");
  }
}

class TextCodec extends CqlTypeCodec {
  constructor() {
    super("text");
  }
  fromDb(value: unknown): CqlValue {
    if (value == null) return new NullValue();
    if (typeof value === "object") return new ScalarValue("json", JSON.stringify(value), (x) => escapeCqlString(x));
    return new ScalarValue("text", String(value), (x) => escapeCqlString(x));
  }
  fromVisual(input: CqlVisualInput): CqlValue {
    if (input.mode === "null") return new NullValue();
    return new ScalarValue("text", input.rawText, (x) => escapeCqlString(x));
  }
}

class ComplexCodec extends CqlTypeCodec {
  constructor() {
    super("complex");
  }
  fromDb(value: unknown): CqlValue {
    if (value == null) return new NullValue();
    if (Array.isArray(value) || isPlainRecord(value)) {
      // Keep editor source in JSON form so Clone/Edit can stage unchanged values.
      return new ScalarValue("json", JSON.stringify(value), (x) => x);
    }
    throw new Error("Invalid complex value from DB");
  }
  fromVisual(input: CqlVisualInput): CqlValue {
    if (input.mode === "null") return new NullValue();
    const raw = input.rawText.trim();
    if (raw === "") throw new Error(EMPTY_FIELD_NOT_VALID_MSG);
    if (!(raw.startsWith("{") || raw.startsWith("["))) {
      throw new Error("Complex value must be JSON object/array");
    }
    const parsed: unknown = JSON.parse(raw);
    if (isPlainRecord(parsed)) {
      const udtLiteral = udtWrapperToLiteral(parsed);
      if (udtLiteral != null) return new ScalarValue("raw", udtLiteral, (x) => x);
      return new ScalarValue("raw", JSON.stringify(parsed), (x) => x);
    }
    if (Array.isArray(parsed)) {
      return new ScalarValue("raw", JSON.stringify(parsed), (x) => x);
    }
    throw new Error("Invalid complex JSON value");
  }
}

function codecFor(cqlType: string): CqlTypeCodec {
  switch (normalizeBaseKind(cqlType)) {
    case "boolean": return new BooleanCodec();
    case "numeric": return new NumericCodec();
    case "blob": return new BlobCodec();
    case "uuid": return new UuidCodec();
    case "timestamp": return new TimestampCodec();
    case "date": return new DateCodec();
    case "time": return new TimeCodec();
    case "duration": return new DurationCodec();
    case "complex": return new ComplexCodec();
    case "json":
    case "text": return new TextCodec();
    default: throw new Error(`Unsupported CQL type: ${cqlType}`);
  }
}

class CqlField {
  private value: CqlValue = new NullValue();
  private readonly codec: CqlTypeCodec;
  constructor(public readonly name: string, public readonly cqlType: string) {
    this.codec = codecFor(cqlType);
  }
  setFromDb(value: unknown): void {
    this.value = this.codec.fromDb(value);
  }
  setFromVisual(input: CqlVisualInput): void {
    this.value = this.codec.fromVisual(input);
  }
  toCqlLiteral(): string {
    return this.value.toCqlLiteral();
  }
  toVisual(): CqlVisualValue {
    return this.value.toVisual();
  }
}

export class CqlValueFactory {
  static fromDbValue(value: unknown, cqlType: string): CqlValue {
    return codecFor(cqlType).fromDb(value);
  }
  static fromVisualInput(input: CqlVisualInput, cqlType: string): CqlValue {
    return codecFor(cqlType).fromVisual(input);
  }
}

export class CqlTableRecord {
  private readonly fields = new Map<string, CqlField>();
  constructor(columns: CqlRecordColumn[]) {
    for (const c of columns) this.fields.set(c.name, new CqlField(c.name, c.type));
  }
  setFromDb(column: CqlRecordColumn, value: unknown): void {
    this.fields.get(column.name)?.setFromDb(value);
  }
  setFromUser(column: CqlRecordColumn, raw: string | null): void {
    this.fields.get(column.name)?.setFromVisual(raw === null ? { mode: "null" } : { mode: "scalar", rawText: raw });
  }
  toInsertParts(columns: CqlRecordColumn[]): { names: string[]; literals: string[] } {
    const names: string[] = [];
    const literals: string[] = [];
    for (const c of columns) {
      const f = this.fields.get(c.name) ?? new CqlField(c.name, c.type);
      names.push(c.name);
      literals.push(f.toCqlLiteral());
    }
    return { names, literals };
  }
  toUpdateSet(columns: CqlRecordColumn[]): string[] {
    return columns.map((c) => `${c.name} = ${(this.fields.get(c.name) ?? new CqlField(c.name, c.type)).toCqlLiteral()}`);
  }
  toVisual(column: CqlRecordColumn): CqlVisualValue {
    return (this.fields.get(column.name) ?? new CqlField(column.name, column.type)).toVisual();
  }
}

export function isComplexCqlTypeName(cqlType: string): boolean {
  const t = cqlType.trim().toLowerCase();
  return t.includes("<") || t.includes("tuple") || t.includes("udt");
}

export function baseCqlTypeName(cqlType: string): string {
  return cqlType.trim().replace(/^frozen\s*</i, "").split("<")[0]?.trim().toLowerCase() ?? "text";
}

export function quoteCqlIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

export function cqlLiteralFromDbValue(value: unknown, cqlType: string): string {
  return CqlValueFactory.fromDbValue(value, cqlType).toCqlLiteral();
}

export function cqlLiteralFromVisualRaw(raw: string, cqlType: string): string {
  const trimmed = raw.trim();
  if (isComplexCqlTypeName(cqlType)) {
    if (trimmed === "") throw new Error(EMPTY_FIELD_NOT_VALID_MSG);
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new Error("Complex value must be valid JSON");
    }
    return complexLiteralFromParsedJson(parsed, cqlType, {
      serializeSimple: cqlLiteralFromDbValue,
      quoteIdent: quoteCqlIdent,
      escapeString: escapeCqlString,
    });
  }
  return CqlValueFactory.fromVisualInput({ mode: "scalar", rawText: raw }, cqlType).toCqlLiteral();
}

