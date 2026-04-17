import type { QueryClient } from "@tanstack/react-query";
import { explorerQueryKeys } from "../../../../constants/feature/scylla/explorer/explorerQueryKeys.constants";

export function removeExplorerQueriesForConnection(qc: QueryClient, connId: number): void {
  void qc.removeQueries({ queryKey: explorerQueryKeys.connection(connId), exact: false });
}

export function removeAllExplorerQueries(qc: QueryClient): void {
  void qc.removeQueries({ queryKey: explorerQueryKeys.root, exact: false });
}
