import type { JsonRow } from "../../../types/scylla/scylla.types";

export type ColumnMeta = {
  name: string;
  kind: string;
  type: string;
  position: number;
};

export function columnMetaFromSchemaRows(rows: JsonRow[]): ColumnMeta[] {
  return rows
    .map((r) => {
      const o = r as Record<string, unknown>;
      return {
        name: String(o.column_name ?? ""),
        kind: String(o.kind ?? ""),
        type: String(o.type ?? "text"),
        position: Number(o.position ?? 0),
      };
    })
    .filter((c) => c.name.length > 0);
}

/** Partition keys first (by position), then clustering keys (by position). */
export function primaryKeyColumns(meta: ColumnMeta[]): ColumnMeta[] {
  const pk = meta.filter((c) => c.kind === "partition_key").sort((a, b) => a.position - b.position);
  const ck = meta.filter((c) => c.kind === "clustering").sort((a, b) => a.position - b.position);
  return [...pk, ...ck];
}

export function regularAndStaticColumns(meta: ColumnMeta[]): ColumnMeta[] {
  return meta.filter((c) => c.kind === "regular" || c.kind === "static");
}

export function rowKeySignature(row: JsonRow, pk: ColumnMeta[]): string {
  return pk.map((c) => JSON.stringify(row[c.name])).join("\u0001");
}
