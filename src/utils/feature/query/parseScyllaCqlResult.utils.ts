import type { JsonRow } from "../../../types/scylla/scylla.types";

export type ScyllaCqlInvokeResult =
  | { kind: "rows"; columns: string[]; rows: JsonRow[] }
  | { kind: "void"; message?: string };

export function parseScyllaCqlInvokeResult(raw: unknown): ScyllaCqlInvokeResult {
  if (raw && typeof raw === "object" && "kind" in raw) {
    const o = raw as { kind?: unknown; columns?: string[]; rows?: JsonRow[]; message?: string };
    if (o.kind === "rows") {
      return { kind: "rows", columns: o.columns ?? [], rows: o.rows ?? [] };
    }
    if (o.kind === "void") {
      return { kind: "void", message: o.message };
    }
  }
  throw new Error("Unexpected scylla_run_cql response");
}
