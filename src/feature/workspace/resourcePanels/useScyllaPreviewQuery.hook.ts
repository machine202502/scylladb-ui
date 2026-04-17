import { useQuery } from "@tanstack/react-query";
import { tauriInvoke } from "../../../utils/appLogger";
import type { ConnectionParams, JsonRow } from "../../../types/scylla/scylla.types";

export function useScyllaPreviewQuery(opts: {
  connId: number;
  params: ConnectionParams | null;
  keyspace: string;
  table: string;
  limit: number;
  offset?: number;
  enabled: boolean;
}) {
  const { connId, params, keyspace, table, limit, offset = 0, enabled } = opts;
  return useQuery({
    queryKey: ["scyllaPreview", connId, keyspace, table, limit, offset],
    enabled: enabled && !!params && keyspace.length > 0 && table.length > 0,
    queryFn: async () => {
      const raw = await tauriInvoke<{ columns: string[]; rows: JsonRow[] }>("scylla_preview", {
        params: params!,
        keyspace,
        table,
        limit: Math.min(500, Math.max(1, Math.floor(limit))),
        offset: Math.max(0, Math.floor(offset)),
      });
      return raw;
    },
  });
}
