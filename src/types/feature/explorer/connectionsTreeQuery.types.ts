import type { QueryFunction } from "@tanstack/react-query";
import type { ExplorerLoadSpec } from "./explorerLoad.types";
import type { ExplorerQueryFailedPayload } from "./explorerQueries.types";

export type ConnectionsTreeQueryValue = {
  tablesQueryFn: QueryFunction<string[]>;
  schemaStringsQueryFn: QueryFunction<string[]>;
  readExplorerStrings: (connId: number, spec: ExplorerLoadSpec) => string[] | undefined;
  refreshExplorer: (connId: number, spec: ExplorerLoadSpec) => void;
  onExplorerQueryFailed: (payload: ExplorerQueryFailedPayload) => void;
};
