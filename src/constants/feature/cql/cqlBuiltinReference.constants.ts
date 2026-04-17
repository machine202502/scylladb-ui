import type { JsonRow } from "../../../types/scylla/scylla.types";

/**
 * Built-in CQL types: constants + practical limits (wire size, notes).
 * Doc baseline: https://docs.scylladb.com/manual/stable/cql/types.html
 */
export const CQL_BUILTIN_TYPES_COLUMNS = [
  "Kind",
  "Type name",
  "Constants",
  "Max (bytes)",
  "Notes",
] as const;

/** Right-aligned numeric column (see DataTable `rightAlignColumns`). */
export const CQL_BUILTIN_TYPES_RIGHT_ALIGN = ["Max (bytes)"] as const;

type MaxB = number;

function typeRow(
  kind: string,
  typeName: string,
  constants: string,
  maxBytes: MaxB | "",
  notes: string,
): JsonRow {
  return {
    Kind: kind,
    "Type name": typeName,
    Constants: constants,
    "Max (bytes)": maxBytes === "" ? "" : maxBytes,
    Notes: notes,
  };
}

export const CQL_BUILTIN_TYPES_ROWS: JsonRow[] = [
  typeRow(
    "Native",
    "ascii",
    "string",
    2147483647,
    "7-bit ASCII only; prefer text/varchar for UTF-8.",
  ),
  typeRow("Native", "bigint", "integer", 8, "64-bit signed; 8 bytes on the wire."),
  typeRow(
    "Native",
    "blob",
    "blob",
    2147483647,
    "Arbitrary bytes; hex 0x…; single value often capped at 2 147 483 647 bytes.",
  ),
  typeRow("Native", "boolean", "boolean", 1, "true / false."),
  typeRow(
    "Native",
    "counter",
    "integer",
    8,
    "Only INCR/DECR; not in PK; table is all counters or none; no TTL.",
  ),
  typeRow(
    "Native",
    "date",
    "integer, string",
    4,
    "Calendar date only; yyyy-mm-dd or internal day number.",
  ),
  typeRow(
    "Native",
    "decimal",
    "integer, float",
    -1,
    "Variable length; arbitrary precision (BigDecimal-style).",
  ),
  typeRow(
    "Native",
    "double",
    "integer, float",
    8,
    "IEEE-754 double; ~±1.8e308; 8 bytes on the wire.",
  ),
  typeRow(
    "Native",
    "duration",
    "duration",
    -1,
    "Nanosecond-resolution components; ISO-8601-style duration literals.",
  ),
  typeRow(
    "Native",
    "float",
    "integer, float",
    4,
    "IEEE-754 float; ~±3.4e38; 4 bytes on the wire.",
  ),
  typeRow(
    "Native",
    "inet",
    "string",
    16,
    "IPv4 or IPv6 as string; on wire up to 16 bytes (IPv6).",
  ),
  typeRow("Native", "int", "integer", 4, "32-bit signed; common PK/clustering type."),
  typeRow("Native", "smallint", "integer", 2, "16-bit signed."),
  typeRow(
    "Native",
    "text",
    "string",
    2147483647,
    "UTF-8; synonym varchar; value size cap typically 2 147 483 647 bytes.",
  ),
  typeRow("Native", "varchar", "string", 2147483647, "UTF-8; synonym text."),
  typeRow(
    "Native",
    "time",
    "integer, string",
    8,
    "Nanoseconds since midnight; string hh:mm:ss[.fffffffff].",
  ),
  typeRow(
    "Native",
    "timestamp",
    "integer, string",
    8,
    "64-bit signed ms since epoch; or ISO-style string.",
  ),
  typeRow(
    "Native",
    "timeuuid",
    "uuid",
    16,
    "UUID v1; 16 bytes; time-ordered inserts.",
  ),
  typeRow("Native", "tinyint", "integer", 1, "8-bit signed."),
  typeRow("Native", "uuid", "uuid", 16, "16 bytes; any RFC-4122 version."),
  typeRow(
    "Native",
    "varint",
    "integer",
    2147483647,
    "Variable-length signed integer; bounded by max value size.",
  ),

  typeRow(
    "Collection",
    "list<T>",
    "list `[ … ]`",
    -1,
    "Ordered; append/prepend not idempotent on retry.",
  ),
  typeRow("Collection", "set<T>", "set `{ … }`", -1, "Sorted unique elements."),
  typeRow("Collection", "map<K,V>", "map `{ k : v }`", -1, "Sorted by key."),
  typeRow(
    "Modifier",
    "frozen<…>",
    "—",
    -1,
    "Immutable composite; required for PK parts and nested collections.",
  ),
  typeRow(
    "Composite",
    "tuple<…>",
    "tuple `( … )`",
    -1,
    "Fixed arity; whole-value updates.",
  ),
  typeRow(
    "Composite",
    "vector<T, n>",
    "list `[ … ]`, len = n",
    -1,
    "Fixed length; no null elements; see manual for vector search.",
  ),
];

/**
 * Built-in CQL functions — aligned with ScyllaDB manual (native scalars, aggregates, vector similarity).
 * See: https://docs.scylladb.com/manual/stable/cql/functions.html
 */
export const CQL_BUILTIN_FUNCTIONS_COLUMNS = ["category", "name"] as const;

export const CQL_BUILTIN_FUNCTIONS_ROWS: JsonRow[] = [
  { category: "Scalar", name: "cast(x AS type)" },
  { category: "Scalar", name: "token(…)" },
  { category: "Scalar", name: "uuid()" },
  { category: "Scalar", name: "currentTimestamp()" },
  { category: "Scalar", name: "currentDate()" },
  { category: "Scalar", name: "currentTime()" },
  { category: "Scalar", name: "currentTimeUUID()" },
  { category: "Scalar", name: "toDate(timeuuid | timestamp)" },
  { category: "Scalar", name: "toTimestamp(timeuuid | date)" },
  { category: "Scalar", name: "toUnixTimestamp(timeuuid | timestamp | date)" },
  { category: "Scalar", name: "dateOf(timeuuid) (deprecated)" },
  { category: "Scalar", name: "unixTimestampOf(timeuuid) (deprecated)" },
  { category: "Scalar", name: "minTimeuuid(timestamp)" },
  { category: "Scalar", name: "maxTimeuuid(timestamp)" },
  { category: "Selector", name: "writetime(column)" },
  { category: "Selector", name: "ttl(column)" },
  {
    category: "Blob",
    name: "{type}AsBlob / blobAs{type} (e.g. bigintAsBlob, blobAsBigint; blob excluded)",
  },
  { category: "Vector", name: "similarity_cosine(v1, v2)" },
  { category: "Vector", name: "similarity_euclidean(v1, v2)" },
  { category: "Vector", name: "similarity_dot_product(v1, v2)" },
  { category: "Aggregate", name: "count(…)" },
  { category: "Aggregate", name: "min(column)" },
  { category: "Aggregate", name: "max(column)" },
  { category: "Aggregate", name: "sum(column)" },
  { category: "Aggregate", name: "avg(column)" },
];
