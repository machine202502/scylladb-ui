import { explorerQueryKeys } from "../../../../constants/feature/scylla/explorer/explorerQueryKeys.constants";
import type { ExplorerLoadSpec } from "../../../../types/feature/explorer/explorerLoad.types";

export function explorerSpecQueryKey(connId: number, spec: ExplorerLoadSpec): readonly unknown[] {
  switch (spec.kind) {
    case "tables":
      return explorerQueryKeys.tables(connId, spec.ks);
    case "columns":
      return explorerQueryKeys.columns(connId, spec.ks, spec.table);
    case "table_indexes":
      return explorerQueryKeys.tableIndexes(connId, spec.ks, spec.table);
    case "table_views":
      return explorerQueryKeys.tableViews(connId, spec.ks, spec.table);
    case "indexes":
      return explorerQueryKeys.indexes(connId, spec.ks);
    case "views":
      return explorerQueryKeys.views(connId, spec.ks);
    case "types":
      return explorerQueryKeys.types(connId, spec.ks);
    case "functions":
      return explorerQueryKeys.functions(connId, spec.ks);
    case "aggregates":
      return explorerQueryKeys.aggregates(connId, spec.ks);
    case "roles":
      return explorerQueryKeys.roles(connId);
    case "permissions":
      return explorerQueryKeys.permissions(connId);
    case "system_keyspaces":
      return explorerQueryKeys.systemKeyspaces(connId);
  }
}
