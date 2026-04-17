import { explorerPaths as P } from "../../../constants/feature/explorer/explorerFolderPaths.constants";
import type { SavedConnection } from "../../../types/scylla/scylla.types";
import type { TreeSelection } from "../../../types/feature/scylla/useScyllaWorkspace.types";
import type {
  WorkspaceEditorTab,
  WorkspaceResourcePayload,
  WorkspaceResourceType,
} from "../../../types/feature/query/workspaceResource.types";

export function workspaceResourceTabId(p: WorkspaceResourcePayload): string {
  return `r:${p.connId}:${p.resourceType}:${encodeURIComponent(p.path)}`;
}

function connectionDisplayName(saved: SavedConnection[], connId: number): string {
  return saved.find((c) => c.id === connId)?.name ?? `#${connId}`;
}

function lastPathSegment(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

/** When a node has no standalone title, show `parent | kind`. */
function parentBarType(parent: string, kind: string): string {
  return `${parent} | ${kind}`;
}

/** Short tab title: own resource name; if none, `parent | type`. */
export function workspaceTabLabel(saved: SavedConnection[], tab: WorkspaceEditorTab): string {
  const cn = (id: number) => connectionDisplayName(saved, id);
  if (tab.variant === "cql") {
    const ks = tab.defaultKeyspace;
    const c = cn(tab.connId);
    return ks ? parentBarType(ks, "CQL") : parentBarType(c, "CQL");
  }
  const p = tab.payload;
  const c = cn(p.connId);
  const ks = p.keyspace;
  const tbl = p.table;

  switch (p.resourceType) {
    case "CONNECTION_ROOT":
      return c;
    case "KEYSPACES_FOLDER":
      return parentBarType(c, "Keyspaces");
    case "KEYSPACE":
      return ks ?? c;
    case "TABLES_FOLDER":
      return ks ? parentBarType(ks, "tables") : parentBarType(c, "tables");
    case "TABLE":
      return tbl ?? ks ?? c;
    case "COLUMNS_FOLDER":
      if (ks && tbl) return parentBarType(`${ks}.${tbl}`, "columns");
      return ks ? parentBarType(ks, "columns") : parentBarType(c, "columns");
    case "COLUMN": {
      const raw = p.columnDisplay ?? p.column;
      if (raw) {
        const base = raw.split("::")[0];
        return base && base.length > 0 ? base : raw;
      }
      if (ks && tbl) return parentBarType(`${ks}.${tbl}`, "column");
      return ks ? parentBarType(ks, "column") : parentBarType(c, "column");
    }
    case "INDEXES_FOLDER":
      if (ks && tbl) return parentBarType(`${ks}.${tbl}`, "indexes");
      return ks ? parentBarType(ks, "indexes") : parentBarType(c, "indexes");
    case "SECONDARY_INDEX":
      if (p.explorerLabel) return p.explorerLabel;
      if (ks && tbl) return parentBarType(`${ks}.${tbl}`, "index");
      return ks ? parentBarType(ks, "index") : parentBarType(c, "index");
    case "VIEWS_FOLDER":
      if (ks && tbl) return parentBarType(`${ks}.${tbl}`, "views");
      return ks ? parentBarType(ks, "views") : parentBarType(c, "views");
    case "MATERIALIZED_VIEW":
      if (p.explorerLabel) return p.explorerLabel;
      if (ks && tbl) return parentBarType(`${ks}.${tbl}`, "MV");
      return ks ? parentBarType(ks, "MV") : parentBarType(c, "MV");
    case "TYPES_FOLDER":
      return ks ? parentBarType(ks, "types") : parentBarType(c, "types");
    case "USER_DEFINED_TYPE":
      if (p.explorerLabel) return p.explorerLabel;
      return ks ? parentBarType(ks, "UDT") : parentBarType(c, "UDT");
    case "FUNCTIONS_ROOT":
      return ks ? parentBarType(ks, "functions") : parentBarType(c, "functions");
    case "FUNCTION": {
      if (p.functionId) {
        const id = p.functionId;
        const dot = id.lastIndexOf(".");
        return dot >= 0 ? id.slice(dot + 1) : id;
      }
      return ks ? parentBarType(ks, "function") : parentBarType(c, "function");
    }
    case "AGGREGATES_ROOT":
      return ks ? parentBarType(ks, "aggregates") : parentBarType(c, "aggregates");
    case "AGGREGATE": {
      if (p.aggregateId) {
        const id = p.aggregateId;
        const dot = id.lastIndexOf(".");
        return dot >= 0 ? id.slice(dot + 1) : id;
      }
      return ks ? parentBarType(ks, "aggregate") : parentBarType(c, "aggregate");
    }
    case "ROLES_ROOT":
      return parentBarType(c, "roles");
    case "ROLE":
      return p.roleName ?? parentBarType(c, "role");
    case "PERMISSIONS_ROOT":
      return parentBarType(c, "permissions");
    case "PERMISSION_GRANT": {
      if (p.permissionLine) {
        const t = p.permissionLine.trim();
        return t.length > 36 ? `${t.slice(0, 34)}…` : t;
      }
      return parentBarType(c, "grant");
    }
    case "SYSTEM_KEYSPACES_FOLDER":
      return parentBarType(c, "system keyspaces");
    case "SYSTEM_KEYSPACE":
      return p.systemKeyspace ?? c;
    case "EXPLORER_FOLDER":
      if (p.explorerLabel) return p.explorerLabel;
      {
        const tail = lastPathSegment(p.path);
        return tail || parentBarType(c, "folder");
      }
    default:
      return c;
  }
}

function folderPathToPayload(connId: number, path: string): WorkspaceResourcePayload {
  if (path === P.keyspaces) {
    return { connId, path, resourceType: "KEYSPACES_FOLDER" };
  }
  if (path === P.functions) {
    return { connId, path, resourceType: "FUNCTIONS_ROOT" };
  }
  if (path === P.aggregates) {
    return { connId, path, resourceType: "AGGREGATES_ROOT" };
  }
  if (path === P.roles) {
    return { connId, path, resourceType: "ROLES_ROOT" };
  }
  if (path === P.permissions) {
    return { connId, path, resourceType: "PERMISSIONS_ROOT" };
  }
  if (path === P.sysKs) {
    return { connId, path, resourceType: "SYSTEM_KEYSPACES_FOLDER" };
  }

  let m = path.match(/^ks\/([^/]+)\/tables$/);
  if (m) {
    return { connId, path, resourceType: "TABLES_FOLDER", keyspace: m[1] };
  }
  m = path.match(/^ks\/([^/]+)\/indexes$/);
  if (m) {
    return { connId, path, resourceType: "INDEXES_FOLDER", keyspace: m[1] };
  }
  m = path.match(/^ks\/([^/]+)\/indexes\/(.+)$/);
  if (m) {
    return {
      connId,
      path,
      resourceType: "SECONDARY_INDEX",
      keyspace: m[1],
      explorerLabel: m[2],
    };
  }
  m = path.match(/^ks\/([^/]+)\/tbl\/([^/]+)\/indexes$/);
  if (m) {
    return { connId, path, resourceType: "INDEXES_FOLDER", keyspace: m[1], table: m[2] };
  }
  m = path.match(/^ks\/([^/]+)\/tbl\/([^/]+)\/indexes\/(.+)$/);
  if (m) {
    return {
      connId,
      path,
      resourceType: "SECONDARY_INDEX",
      keyspace: m[1],
      table: m[2],
      explorerLabel: m[3],
    };
  }
  m = path.match(/^ks\/([^/]+)\/views$/);
  if (m) {
    return { connId, path, resourceType: "VIEWS_FOLDER", keyspace: m[1] };
  }
  m = path.match(/^ks\/([^/]+)\/tbl\/([^/]+)\/views$/);
  if (m) {
    return { connId, path, resourceType: "VIEWS_FOLDER", keyspace: m[1], table: m[2] };
  }
  m = path.match(/^ks\/([^/]+)\/views\/(.+)$/);
  if (m) {
    return {
      connId,
      path,
      resourceType: "MATERIALIZED_VIEW",
      keyspace: m[1],
      explorerLabel: m[2],
    };
  }
  m = path.match(/^ks\/([^/]+)\/tbl\/([^/]+)\/views\/(.+)$/);
  if (m) {
    return {
      connId,
      path,
      resourceType: "MATERIALIZED_VIEW",
      keyspace: m[1],
      table: m[2],
      explorerLabel: m[3],
    };
  }
  m = path.match(/^ks\/([^/]+)\/types$/);
  if (m) {
    return { connId, path, resourceType: "TYPES_FOLDER", keyspace: m[1] };
  }
  m = path.match(/^ks\/([^/]+)\/types\/(.+)$/);
  if (m) {
    return {
      connId,
      path,
      resourceType: "USER_DEFINED_TYPE",
      keyspace: m[1],
      explorerLabel: m[2],
    };
  }
  m = path.match(/^ks\/([^/]+)\/functions$/);
  if (m) {
    return { connId, path, resourceType: "FUNCTIONS_ROOT", keyspace: m[1] };
  }
  m = path.match(/^ks\/([^/]+)\/functions\/(.+)$/);
  if (m) {
    return { connId, path, resourceType: "FUNCTION", keyspace: m[1], functionId: m[2] };
  }
  m = path.match(/^ks\/([^/]+)\/aggregates$/);
  if (m) {
    return { connId, path, resourceType: "AGGREGATES_ROOT", keyspace: m[1] };
  }
  m = path.match(/^ks\/([^/]+)\/aggregates\/(.+)$/);
  if (m) {
    return { connId, path, resourceType: "AGGREGATE", keyspace: m[1], aggregateId: m[2] };
  }
  m = path.match(/^ks\/([^/]+)\/tbl\/([^/]+)\/columns$/);
  if (m) {
    return { connId, path, resourceType: "COLUMNS_FOLDER", keyspace: m[1], table: m[2] };
  }
  m = path.match(/^ks\/([^/]+)\/tbl\/([^/]+)\/columns\/(.+)$/);
  if (m) {
    const display = m[3];
    return {
      connId,
      path,
      resourceType: "COLUMN",
      keyspace: m[1],
      table: m[2],
      columnDisplay: display,
      column: display.split("::")[0] ?? display,
    };
  }
  m = path.match(/^ks\/([^/]+)\/tbl\/([^/]+)$/);
  if (m) {
    return { connId, path, resourceType: "TABLE", keyspace: m[1], table: m[2] };
  }

  m = path.match(/^functions\/(.+)$/);
  if (m) {
    return { connId, path, resourceType: "FUNCTION", functionId: m[1] };
  }
  m = path.match(/^aggregates\/(.+)$/);
  if (m) {
    return { connId, path, resourceType: "AGGREGATE", aggregateId: m[1] };
  }
  m = path.match(/^roles\/(.+)$/);
  if (m) {
    return { connId, path, resourceType: "ROLE", roleName: m[1] };
  }
  m = path.match(/^permissions\/(.+)$/);
  if (m) {
    return { connId, path, resourceType: "PERMISSION_GRANT", permissionLine: m[1] };
  }
  m = path.match(/^sys\/keyspaces\/(.+)$/);
  if (m) {
    return { connId, path, resourceType: "SYSTEM_KEYSPACE", systemKeyspace: m[1] };
  }
  const tail = path.split("/").filter(Boolean).pop() ?? path;
  return { connId, path, resourceType: "EXPLORER_FOLDER", explorerLabel: tail };
}

/** Explorer path string for the current tree selection (matches resource tab `payload.path` shape). */
export function treeSelectionToExplorerPath(sel: Exclude<TreeSelection, null>): string {
  if (sel.kind === "root") return P.root;
  if (sel.kind === "folder") return sel.path;
  if (sel.kind === "keyspace") return P.ks(sel.ks);
  return P.ksTbl(sel.ks, sel.table);
}

export function savedConnectionFooterParts(
  savedConn: SavedConnection | undefined,
  connId: number,
): { name: string; hostPort: string } {
  const name = savedConn?.name ?? `#${connId}`;
  const host = savedConn?.contactPoints?.[0]?.trim() ?? "—";
  const port = savedConn?.port ?? 9042;
  return { name, hostPort: `${host}:${port}` };
}

/** Tree path for footer: resource tab uses `payload.path`; CQL tab uses tree selection when it matches the tab connection. */
export function workspaceTabTreePath(tab: WorkspaceEditorTab, treeSelection: TreeSelection): string {
  if (tab.variant === "resource") return tab.payload.path;
  if (treeSelection != null && treeSelection.connId === tab.connId) {
    return treeSelectionToExplorerPath(treeSelection);
  }
  return "—";
}

export function treeSelectionToResourcePayload(sel: Exclude<TreeSelection, null>): WorkspaceResourcePayload {
  const connId = sel.connId;
  if (sel.kind === "root") {
    return { connId, path: "root", resourceType: "CONNECTION_ROOT" };
  }
  if (sel.kind === "keyspace") {
    return { connId, path: P.ks(sel.ks), resourceType: "KEYSPACE", keyspace: sel.ks };
  }
  if (sel.kind === "table") {
    return {
      connId,
      path: P.ksTbl(sel.ks, sel.table),
      resourceType: "TABLE",
      keyspace: sel.ks,
      table: sel.table,
    };
  }
  return folderPathToPayload(connId, sel.path);
}

export function payloadToTreeSelection(p: WorkspaceResourcePayload): TreeSelection {
  const { connId } = p;
  switch (p.resourceType) {
    case "CONNECTION_ROOT":
      return { connId, kind: "root" };
    case "KEYSPACE":
      return { connId, kind: "keyspace", ks: p.keyspace ?? "" };
    case "TABLE":
      return {
        connId,
        kind: "table",
        ks: p.keyspace ?? "",
        table: p.table ?? "",
      };
    default:
      return { connId, kind: "folder", path: p.path };
  }
}

export function defaultKeyspaceForCql(sel: TreeSelection | null): string | null {
  if (sel == null) return null;
  if (sel.kind === "keyspace" || sel.kind === "table") {
    return sel.ks;
  }
  if (sel.kind === "folder") {
    const m = sel.path.match(/^ks\/([^/]+)/);
    if (m) return m[1];
  }
  return null;
}

export function treeSelectionAllowsCql(sel: TreeSelection | null, connected: boolean): boolean {
  if (!connected || sel == null) return false;
  if (sel.kind === "root") return false;
  return true;
}

export function resourceTypeLabel(t: WorkspaceResourceType): string {
  const map: Record<WorkspaceResourceType, string> = {
    CONNECTION_ROOT: "Подключение",
    KEYSPACES_FOLDER: "Keyspaces",
    KEYSPACE: "Keyspace",
    TABLES_FOLDER: "Таблицы",
    TABLE: "Таблица",
    COLUMNS_FOLDER: "Колонки",
    COLUMN: "Колонка",
    INDEXES_FOLDER: "Индексы",
    SECONDARY_INDEX: "Индекс",
    VIEWS_FOLDER: "Materialized views",
    MATERIALIZED_VIEW: "Materialized view",
    TYPES_FOLDER: "Типы (TYPES)",
    USER_DEFINED_TYPE: "TYPES",
    FUNCTIONS_ROOT: "Функции",
    FUNCTION: "Функция",
    AGGREGATES_ROOT: "Агрегаты",
    AGGREGATE: "Агрегат",
    ROLES_ROOT: "Роли",
    ROLE: "Роль",
    PERMISSIONS_ROOT: "Права",
    PERMISSION_GRANT: "Grant",
    SYSTEM_KEYSPACES_FOLDER: "Системные keyspace",
    SYSTEM_KEYSPACE: "Системный keyspace",
    EXPLORER_FOLDER: "Папка",
  };
  return map[t];
}
