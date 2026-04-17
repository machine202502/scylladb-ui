import { useQuery } from "@tanstack/react-query";
import type { ExplorerLoadSpec } from "../../../types/feature/explorer/explorerLoad.types";
import { explorerSpecQueryKey } from "../../../utils/feature/scylla/explorer/explorerQueryKey.utils";
import { useConnectionsTreeQuery } from "./useConnectionsTreeQuery.hook";
import { useExplorerQueryFailureReport } from "./useExplorerQueryFailureReport.hook";

export function useExplorerStringsQuery(connId: number, spec: ExplorerLoadSpec, enabled: boolean) {
  const { tablesQueryFn, schemaStringsQueryFn, onExplorerQueryFailed } = useConnectionsTreeQuery();
  const queryKey = explorerSpecQueryKey(connId, spec);
  const queryFn = spec.kind === "tables" ? tablesQueryFn : schemaStringsQueryFn;
  const q = useQuery({ queryKey, queryFn, enabled });
  useExplorerQueryFailureReport(q.isError, queryKey, connId, onExplorerQueryFailed);
  return q;
}
