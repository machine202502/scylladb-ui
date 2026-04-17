import { parseTypeAst, type CqlTypeAst } from "./cqlTypeAst";

type Deps = {
  serializeSimple: (value: unknown, cqlType: string) => string;
  quoteIdent: (name: string) => string;
  escapeString: (s: string) => string;
};

function normalizeMapKey(k: string): string {
  const s = k.trim();
  if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith("\"") && s.endsWith("\""))) return s.slice(1, -1);
  return s;
}

function isPlainRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function fieldIdent(name: string, quoteIdent: (name: string) => string): string {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name) ? name : quoteIdent(name);
}

function inferUdtAnyToCql(v: unknown, deps: Deps, inUdt = false): string {
  if (v == null) return "NULL";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "string") return deps.escapeString(v);
  if (Array.isArray(v)) return inUdt ? `(${v.map((x) => inferUdtAnyToCql(x, deps)).join(", ")})` : `[${v.map((x) => inferUdtAnyToCql(x, deps)).join(", ")}]`;
  if (typeof v === "object") {
    const r = v as Record<string, unknown>;
    return `{${Object.entries(r).map(([k, vv]) => `${fieldIdent(k, deps.quoteIdent)}: ${inferUdtAnyToCql(vv, deps, inUdt)}`).join(", ")}}`;
  }
  return deps.escapeString(String(v));
}

function complexToCql(value: unknown, ast: CqlTypeAst, deps: Deps): string {
  if (value == null) return "NULL";
  if (ast.kind === "frozen") return complexToCql(value, ast.inner, deps);
  if (ast.kind === "simple") {
    const known = ["boolean", "bool", "int", "bigint", "smallint", "tinyint", "double", "float", "varint", "counter", "decimal", "blob", "uuid", "timeuuid", "timestamp", "text", "ascii", "varchar", "inet", "date", "time", "duration"];
    if (known.includes(ast.name)) return deps.serializeSimple(value, ast.name);
    if (!isPlainRecord(value)) throw new Error(`UDT value for ${ast.name} must be JSON object`);
    const recRaw = value as Record<string, unknown>;
    const rec = isPlainRecord(recRaw.fields) ? (recRaw.fields as Record<string, unknown>) : recRaw;
    return `{${Object.entries(rec).map(([k, v]) => `${fieldIdent(k, deps.quoteIdent)}: ${inferUdtAnyToCql(v, deps, true)}`).join(", ")}}`;
  }
  if (ast.kind === "list") {
    if (!Array.isArray(value)) throw new Error("List value must be JSON array");
    return `[${value.map((v) => complexToCql(v, ast.inner, deps)).join(", ")}]`;
  }
  if (ast.kind === "set") {
    if (!Array.isArray(value)) throw new Error("Set value must be JSON array");
    return `{${value.map((v) => complexToCql(v, ast.inner, deps)).join(", ")}}`;
  }
  if (ast.kind === "tuple") {
    if (!Array.isArray(value)) throw new Error("Tuple value must be JSON array");
    if (value.length !== ast.items.length) throw new Error("Tuple arity mismatch");
    return `(${value.map((v, i) => complexToCql(v, ast.items[i], deps)).join(", ")})`;
  }
  if (ast.kind !== "map") throw new Error("Unsupported complex type");
  if (!isPlainRecord(value)) throw new Error("Map value must be JSON object");
  const rec = value as Record<string, unknown>;
  return `{${Object.entries(rec).map(([k, v]) => `${complexToCql(normalizeMapKey(k), ast.key, deps)}: ${complexToCql(v, ast.value, deps)}`).join(", ")}}`;
}

export function complexLiteralFromParsedJson(parsed: unknown, cqlType: string, deps: Deps): string {
  return complexToCql(parsed, parseTypeAst(cqlType), deps);
}

