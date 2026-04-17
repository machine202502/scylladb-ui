import type { QueryFunction } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { tauriInvoke } from "../../../utils/appLogger";
import { useCallback, useMemo, useRef } from "react";
import type { ExplorerLoadSpec } from "../../../types/feature/explorer/explorerLoad.types";
import type { SavedConnection } from "../../../types/scylla/scylla.types";
import type { ExplorerQueriesBundle } from "../../../types/feature/scylla/explorer/useExplorerQueries.types";
import { normalizeConnId } from "../../../utils/connectionId";
import { paramsFromSaved } from "../../../utils/paramsFromSaved";
import { explorerSpecQueryKey } from "../../../utils/feature/scylla/explorer/explorerQueryKey.utils";

export function useExplorerQueries(saved: SavedConnection[], notifyError: (e: unknown) => void): ExplorerQueriesBundle {
  const qc = useQueryClient();
  const savedRef = useRef(saved);
  savedRef.current = saved;
  const notifyRef = useRef(notifyError);
  notifyRef.current = notifyError;

  const tablesQueryFn = useCallback<QueryFunction<string[]>>(async ({ queryKey }) => {
    const connId = queryKey[2];
    const ks = queryKey[4];
    if (typeof connId !== "number" || typeof ks !== "string") {
      throw new Error("Invalid explorer tables queryKey");
    }
    const c = savedRef.current.find((x) => normalizeConnId(x.id) === connId);
    if (!c) throw new Error("Connection not found");
    try {
      return await tauriInvoke<string[]>("scylla_tables", {
        params: paramsFromSaved(c),
        keyspace: ks,
      });
    } catch (e) {
      notifyRef.current(e);
      throw e;
    }
  }, []);

  const schemaStringsQueryFn = useCallback<QueryFunction<string[]>>(async ({ queryKey }) => {
    const connId = queryKey[2];
    const branch = queryKey[3];
    if (typeof connId !== "number" || typeof branch !== "string") {
      throw new Error("Invalid explorer schema queryKey");
    }
    const c = savedRef.current.find((x) => normalizeConnId(x.id) === connId);
    if (!c) throw new Error("Connection not found");
    const params = paramsFromSaved(c);
    try {
      switch (branch) {
        case "indexes":
        case "views":
        case "types":
          return await tauriInvoke<string[]>("scylla_schema_list", {
            params,
            kind: branch,
            keyspace: String(queryKey[4]),
            table: undefined,
          });
        case "columns":
          return await tauriInvoke<string[]>("scylla_schema_list", {
            params,
            kind: "columns",
            keyspace: String(queryKey[4]),
            table: String(queryKey[5]),
          });
        case "table_indexes":
          return await tauriInvoke<string[]>("scylla_schema_list", {
            params,
            kind: "indexes",
            keyspace: String(queryKey[4]),
            table: String(queryKey[5]),
          });
        case "table_views":
          return await tauriInvoke<string[]>("scylla_schema_list", {
            params,
            kind: "views",
            keyspace: String(queryKey[4]),
            table: String(queryKey[5]),
          });
        case "functions":
        case "aggregates":
        case "roles":
        case "permissions":
        case "system_keyspaces":
          return await tauriInvoke<string[]>("scylla_schema_list", {
            params,
            kind: branch,
            keyspace: typeof queryKey[4] === "string" ? String(queryKey[4]) : undefined,
            table: undefined,
          });
        default:
          throw new Error(`Unknown explorer query branch: ${branch}`);
      }
    } catch (e) {
      notifyRef.current(e);
      throw e;
    }
  }, []);

  const readExplorerStrings = useCallback(
    (connId: number, spec: ExplorerLoadSpec) => {
      const key = explorerSpecQueryKey(connId, spec);
      const data = qc.getQueryData(key);
      return data === undefined ? undefined : (data as string[]);
    },
    [qc],
  );

  return useMemo(
    () => ({ tablesQueryFn, schemaStringsQueryFn, readExplorerStrings }),
    [tablesQueryFn, schemaStringsQueryFn, readExplorerStrings],
  );
}
