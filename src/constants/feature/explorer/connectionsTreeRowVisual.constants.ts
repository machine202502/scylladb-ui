import type { ConnectionsTreeRowKind } from "../../../types/feature/explorer/connectionsTreeRow.types";

export const TREE_ROW_LABEL_META: Record<
  ConnectionsTreeRowKind,
  { labelUpper: string; showEntityName: boolean; showTypeLabel?: boolean }
> = {
  keyspaces_folder: { labelUpper: "KEYSPACES", showEntityName: false },
  keyspace: { labelUpper: "KEYSPACE", showEntityName: true, showTypeLabel: false },
  tables_folder: { labelUpper: "TABLES", showEntityName: false },
  table: { labelUpper: "TABLE", showEntityName: true },
  columns_folder: { labelUpper: "COLUMNS", showEntityName: false },
  column: { labelUpper: "COLUMN", showEntityName: true },
  indexes_folder: { labelUpper: "INDEXES", showEntityName: false },
  index: { labelUpper: "INDEX", showEntityName: true },
  mv_folder: { labelUpper: "MATERIALIZED VIEWS", showEntityName: false },
  mv: { labelUpper: "MV", showEntityName: true },
  udt_folder: { labelUpper: "TYPES", showEntityName: false },
  udt: { labelUpper: "TYPES", showEntityName: true },
  functions_folder: { labelUpper: "FUNCTIONS", showEntityName: false },
  function: { labelUpper: "FUNCTION", showEntityName: true },
  aggregates_folder: { labelUpper: "AGGREGATES", showEntityName: false },
  aggregate: { labelUpper: "AGGREGATE", showEntityName: true },
  roles_folder: { labelUpper: "ROLES", showEntityName: false },
  role: { labelUpper: "ROLE", showEntityName: true },
  permissions_folder: { labelUpper: "PERMISSIONS", showEntityName: false },
  permission: { labelUpper: "PERMISSION", showEntityName: true },
  system_keyspace_folder: { labelUpper: "SYSTEM KEYSPACES", showEntityName: false },
};
