import { explorerPaths as P } from "../../../../constants/feature/explorer/explorerFolderPaths.constants";

export function folderKeysToCloseAfterExplorerQueryError(queryKey: readonly unknown[]): string[] {
  if (queryKey.length < 4 || queryKey[0] !== "scylla" || queryKey[1] !== "explorer") return [];
  const branch = queryKey[3];
  switch (branch) {
    case "tables": {
      const ks = String(queryKey[4] ?? "");
      if (!ks) return [];
      return [P.ks(ks), P.ksTables(ks)];
    }
    case "columns": {
      const ks = String(queryKey[4] ?? "");
      const table = String(queryKey[5] ?? "");
      if (!ks || !table) return [];
      return [P.ksCols(ks, table)];
    }
    case "table_indexes": {
      const ks = String(queryKey[4] ?? "");
      const table = String(queryKey[5] ?? "");
      if (!ks || !table) return [];
      return [P.ksTblIdx(ks, table)];
    }
    case "indexes":
      return [P.ksIdx(String(queryKey[4] ?? ""))];
    case "views":
      return [P.ksViews(String(queryKey[4] ?? ""))];
    case "table_views": {
      const ks = String(queryKey[4] ?? "");
      const table = String(queryKey[5] ?? "");
      if (!ks || !table) return [];
      return [P.ksTblViews(ks, table)];
    }
    case "types":
      return [P.ksTypes(String(queryKey[4] ?? ""))];
    case "functions":
      return queryKey[4] ? [P.ksFunctions(String(queryKey[4]))] : [P.functions];
    case "aggregates":
      return queryKey[4] ? [P.ksAggregates(String(queryKey[4]))] : [P.aggregates];
    case "roles":
      return [P.roles];
    case "permissions":
      return [P.permissions];
    case "system_keyspaces":
      return [P.sysKs];
    default:
      return [];
  }
}
