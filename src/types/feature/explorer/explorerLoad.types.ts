export type ExplorerLoadSpec =
  | { kind: "tables"; ks: string }
  | { kind: "columns"; ks: string; table: string }
  | { kind: "table_indexes"; ks: string; table: string }
  | { kind: "table_views"; ks: string; table: string }
  | { kind: "indexes" | "views" | "types"; ks: string }
  | { kind: "functions"; ks?: string }
  | { kind: "aggregates"; ks?: string }
  | { kind: "roles" | "permissions" | "system_keyspaces" };
