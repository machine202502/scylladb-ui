export const explorerQueryKeys = {
  root: ["scylla", "explorer"] as const,
  connection: (connId: number) => ["scylla", "explorer", connId] as const,
  tables: (connId: number, ks: string) => ["scylla", "explorer", connId, "tables", ks] as const,
  columns: (connId: number, ks: string, table: string) =>
    ["scylla", "explorer", connId, "columns", ks, table] as const,
  tableIndexes: (connId: number, ks: string, table: string) =>
    ["scylla", "explorer", connId, "table_indexes", ks, table] as const,
  tableViews: (connId: number, ks: string, table: string) =>
    ["scylla", "explorer", connId, "table_views", ks, table] as const,
  indexes: (connId: number, ks: string) => ["scylla", "explorer", connId, "indexes", ks] as const,
  views: (connId: number, ks: string) => ["scylla", "explorer", connId, "views", ks] as const,
  types: (connId: number, ks: string) => ["scylla", "explorer", connId, "types", ks] as const,
  functions: (connId: number, ks?: string) =>
    ks ? (["scylla", "explorer", connId, "functions", ks] as const) : (["scylla", "explorer", connId, "functions"] as const),
  aggregates: (connId: number, ks?: string) =>
    ks ? (["scylla", "explorer", connId, "aggregates", ks] as const) : (["scylla", "explorer", connId, "aggregates"] as const),
  roles: (connId: number) => ["scylla", "explorer", connId, "roles"] as const,
  permissions: (connId: number) => ["scylla", "explorer", connId, "permissions"] as const,
  systemKeyspaces: (connId: number) => ["scylla", "explorer", connId, "system_keyspaces"] as const,
};
