import { useMemo, useState, type ReactNode } from "react";
import "./ConnectionRootPanel.css";
import type { ConnectionParams } from "../../types/scylla/scylla.types";
import type { LiveSession } from "../../types/feature/scylla/useScyllaWorkspace.types";
import {
  CQL_BUILTIN_FUNCTIONS_COLUMNS,
  CQL_BUILTIN_FUNCTIONS_ROWS,
  CQL_BUILTIN_TYPES_COLUMNS,
  CQL_BUILTIN_TYPES_RIGHT_ALIGN,
  CQL_BUILTIN_TYPES_ROWS,
} from "../../constants/feature/cql/cqlBuiltinReference.constants";
import { DataTable } from "../../ui/DataTable";
import { CenterSpinner } from "./CenterSpinner";
import { useScyllaRowsQuery } from "./resourcePanels/useScyllaRowsQuery.hook";
import { errorMessage } from "../../utils/errorMessage";
import { isSystemKeyspaceName } from "../../utils/feature/scylla/keyspaceScope.utils";

type TabId = "overview" | "settings" | "functions" | "types";

function maxReplicationFactor(replication: unknown): number | null {
  let map: Record<string, unknown> | null = null;
  if (replication != null && typeof replication === "object" && !Array.isArray(replication)) {
    map = replication as Record<string, unknown>;
  } else if (typeof replication === "string") {
    try {
      const p = JSON.parse(replication) as unknown;
      if (p != null && typeof p === "object" && !Array.isArray(p)) map = p as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  if (!map) return null;
  let maxRf = 0;
  for (const [k, v] of Object.entries(map)) {
    if (k === "class") continue;
    const n = typeof v === "number" ? v : Number.parseInt(String(v), 10);
    if (Number.isFinite(n) && n > maxRf) maxRf = n;
  }
  return maxRf > 0 ? maxRf : null;
}

/** Outer clips width; inner uses overflow-x: scroll so horizontal bar is usable (see tauri.conf: avoid fluentOverlay). */
function ConnectionScrollTable({ children }: { children: ReactNode }) {
  return (
    <div className="connectionRoot__tableOuter">
      <div className="connectionRoot__tableInner">{children}</div>
    </div>
  );
}

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "settings", label: "Settings" },
  { id: "functions", label: "Built-in functions" },
  { id: "types", label: "Built-in types" },
];

type Props = {
  params: ConnectionParams;
  live: LiveSession;
};

export function ConnectionRootPanel({ params, live }: Props) {
  const [tab, setTab] = useState<TabId>("overview");

  const localQ = useScyllaRowsQuery({
    queryKey: ["connRoot", "local"],
    params,
    cql: "SELECT * FROM system.local",
    currentKeyspace: null,
    enabled: tab === "settings",
  });

  const keyspacesQ = useScyllaRowsQuery({
    queryKey: ["schema", "keyspacesMeta"],
    params,
    cql: "SELECT keyspace_name, durable_writes, replication FROM system_schema.keyspaces",
    currentKeyspace: null,
    enabled: tab === "settings",
  });

  const clientsQ = useScyllaRowsQuery({
    queryKey: ["connRoot", "clients"],
    params,
    cql: "SELECT * FROM system.clients LIMIT 500",
    currentKeyspace: null,
    enabled: tab === "settings",
  });

  const release = live.cluster?.releaseVersion;
  const clusterName = live.cluster?.clusterName;

  const userKeyspaceRows = useMemo(() => {
    return (keyspacesQ.data?.rows ?? []).filter(
      (r) => !isSystemKeyspaceName(String(r.keyspace_name ?? "")),
    );
  }, [keyspacesQ.data?.rows]);

  const replicationSummary = useMemo(() => {
    let maxRf = 0;
    for (const row of userKeyspaceRows) {
      const m = maxReplicationFactor(row.replication);
      if (m != null && m > maxRf) maxRf = m;
    }
    return maxRf > 0 ? String(maxRf) : null;
  }, [userKeyspaceRows]);

  return (
    <div className="connectionRoot">
      <div className="connectionRoot__tabs" role="tablist" aria-label="Connection sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`connectionRoot__tabBtn${tab === t.id ? " connectionRoot__tabBtn_active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="connectionRoot__tabPanel" role="tabpanel">
        {tab === "overview" && (
          <div className="connectionRoot__overview">
            <dl className="connectionRoot__kv">
              <dt>Release</dt>
              <dd>{release != null && release !== "" ? release : "—"}</dd>
              <dt>Cluster name</dt>
              <dd>{clusterName != null && clusterName !== "" ? clusterName : "—"}</dd>
            </dl>
          </div>
        )}

        {tab === "settings" && (
          <div className="connectionRoot__settings">
            <section>
              <h3 className="connectionRoot__sectionTitle">Node (system.local)</h3>
              {localQ.isPending && <CenterSpinner />}
              {localQ.isError && <p className="connectionRoot__muted">{errorMessage(localQ.error)}</p>}
              {localQ.data?.notice && <p className="workspaceResourcePanel__notice">{localQ.data.notice}</p>}
              {!localQ.isPending && !localQ.isError && localQ.data && !localQ.data.notice && (
                <ConnectionScrollTable>
                  <DataTable columns={localQ.data.columns} rows={localQ.data.rows} />
                </ConnectionScrollTable>
              )}
            </section>

            <section>
              <h3 className="connectionRoot__sectionTitle">
                User keyspaces · replication ·{" "}
                <span className="dataWorkspace__mono">system_schema.keyspaces</span>
              </h3>
              {replicationSummary != null && (
                <p className="connectionRoot__hint">
                  Highest replication factor (RF) across non-system keyspaces from the{" "}
                  <span className="dataWorkspace__mono">replication</span> map in{" "}
                  <span className="dataWorkspace__mono">system_schema.keyspaces</span>:{" "}
                  <strong>{replicationSummary}</strong>
                </p>
              )}
              {keyspacesQ.isPending && <CenterSpinner />}
              {keyspacesQ.isError && <p className="connectionRoot__muted">{errorMessage(keyspacesQ.error)}</p>}
              {keyspacesQ.data?.notice && (
                <p className="workspaceResourcePanel__notice">{keyspacesQ.data.notice}</p>
              )}
              {!keyspacesQ.isPending && !keyspacesQ.isError && keyspacesQ.data && !keyspacesQ.data.notice && (
                <ConnectionScrollTable>
                  <DataTable columns={keyspacesQ.data.columns} rows={userKeyspaceRows} />
                </ConnectionScrollTable>
              )}
            </section>

            <section>
              <h3 className="connectionRoot__sectionTitle">Client connections (system.clients)</h3>
              {clientsQ.isPending && <CenterSpinner />}
              {clientsQ.isError && (
                <p className="connectionRoot__muted">
                  {errorMessage(clientsQ.error)} — table may be missing or unavailable on some Scylla versions.
                </p>
              )}
              {clientsQ.data?.notice && (
                <p className="workspaceResourcePanel__notice">{clientsQ.data.notice}</p>
              )}
              {!clientsQ.isError && clientsQ.data && !clientsQ.data.notice && (
                <>
                  <p className="connectionRoot__hint">
                    <span className="dataWorkspace__mono">system.clients</span>: rows in result{" "}
                    <strong>{clientsQ.data.rows.length}</strong>
                    {clientsQ.data.rows.length >= 500 ? " (LIMIT 500)" : ""}.
                  </p>
                  <ConnectionScrollTable>
                    <DataTable columns={clientsQ.data.columns} rows={clientsQ.data.rows} />
                  </ConnectionScrollTable>
                </>
              )}
            </section>
          </div>
        )}

        {tab === "functions" && (
          <ConnectionScrollTable>
            <DataTable columns={[...CQL_BUILTIN_FUNCTIONS_COLUMNS]} rows={CQL_BUILTIN_FUNCTIONS_ROWS} />
          </ConnectionScrollTable>
        )}

        {tab === "types" && (
          <ConnectionScrollTable>
            <DataTable
              columns={[...CQL_BUILTIN_TYPES_COLUMNS]}
              rows={CQL_BUILTIN_TYPES_ROWS}
              rightAlignColumns={[...CQL_BUILTIN_TYPES_RIGHT_ALIGN]}
            />
          </ConnectionScrollTable>
        )}
      </div>
    </div>
  );
}
