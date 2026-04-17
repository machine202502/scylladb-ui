import { useQuery } from "@tanstack/react-query";
import { tauriInvoke } from "../../../utils/appLogger";
import type { ConnectionParams, JsonRow } from "../../../types/scylla/scylla.types";
import { parseScyllaCqlInvokeResult } from "../../../utils/feature/query/parseScyllaCqlResult.utils";

export type ScyllaRowsQueryResult = {
  columns: string[];
  rows: JsonRow[];
  notice?: string;
};

export function useScyllaRowsQuery(opts: {
  queryKey: readonly unknown[];
  params: ConnectionParams | null;
  cql: string;
  currentKeyspace: string | null;
  enabled: boolean;
}) {
  const { queryKey, params, cql, currentKeyspace, enabled } = opts;
  return useQuery({
    queryKey: [...queryKey, currentKeyspace, cql],
    enabled: enabled && !!params && cql.trim().length > 0,
    queryFn: async (): Promise<ScyllaRowsQueryResult> => {
      const raw = await tauriInvoke<unknown>("scylla_run_cql", {
        params,
        cql: cql.trim(),
        currentKeyspace: currentKeyspace ?? null,
      });
      const parsed = parseScyllaCqlInvokeResult(raw);
      if (parsed.kind === "void") {
        return { columns: [], rows: [], notice: parsed.message };
      }
      return { columns: parsed.columns, rows: parsed.rows };
    },
  });
}
