export type WorkspaceResourceType =
  | "CONNECTION_ROOT"
  | "KEYSPACES_FOLDER"
  | "KEYSPACE"
  | "TABLES_FOLDER"
  | "TABLE"
  | "COLUMNS_FOLDER"
  | "COLUMN"
  | "INDEXES_FOLDER"
  | "SECONDARY_INDEX"
  | "VIEWS_FOLDER"
  | "MATERIALIZED_VIEW"
  | "TYPES_FOLDER"
  | "USER_DEFINED_TYPE"
  | "FUNCTIONS_ROOT"
  | "FUNCTION"
  | "AGGREGATES_ROOT"
  | "AGGREGATE"
  | "ROLES_ROOT"
  | "ROLE"
  | "PERMISSIONS_ROOT"
  | "PERMISSION_GRANT"
  | "SYSTEM_KEYSPACES_FOLDER"
  | "SYSTEM_KEYSPACE"
  | "EXPLORER_FOLDER";

export type WorkspaceResourcePayload = {
  connId: number;
  path: string;
  resourceType: WorkspaceResourceType;
  keyspace?: string;
  table?: string;
  column?: string;
  columnDisplay?: string;
  functionId?: string;
  aggregateId?: string;
  roleName?: string;
  permissionLine?: string;
  systemKeyspace?: string;
  explorerLabel?: string;
};

export type WorkspaceEditorCqlTab = {
  variant: "cql";
  id: string;
  connId: number;
  defaultKeyspace: string | null;
};

export type WorkspaceEditorResourceTab = {
  variant: "resource";
  id: string;
  payload: WorkspaceResourcePayload;
};

export type WorkspaceEditorTab = WorkspaceEditorCqlTab | WorkspaceEditorResourceTab;
