import { useEffect, useRef } from "react";
import type { ExplorerQueryFailedPayload } from "../../../types/feature/explorer/explorerQueries.types";
import { folderKeysToCloseAfterExplorerQueryError } from "../../../utils/feature/scylla/explorer/explorerQueryErrorCollapse.utils";

export function useExplorerQueryFailureReport(
  isError: boolean,
  queryKey: readonly unknown[],
  connId: number,
  onExplorerQueryFailed: (payload: ExplorerQueryFailedPayload) => void,
): void {
  const handledRef = useRef(new Set<string>());
  useEffect(() => {
    const sig = JSON.stringify(queryKey);
    if (!isError) {
      handledRef.current.delete(sig);
      return;
    }
    if (handledRef.current.has(sig)) return;
    handledRef.current.add(sig);
    const folderKeys = folderKeysToCloseAfterExplorerQueryError(queryKey);
    onExplorerQueryFailed({ connId, queryKey, folderKeys });
  }, [isError, queryKey, connId, onExplorerQueryFailed]);
}
