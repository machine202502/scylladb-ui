import { useMemo } from "react";
import type { WorkspaceResourcePayload } from "../../types/feature/query/workspaceResource.types";
import type { LiveSession } from "../../types/feature/scylla/useScyllaWorkspace.types";
import type { ConnectionParams, SavedConnection } from "../../types/scylla/scylla.types";
import { paramsFromSaved } from "../../utils/paramsFromSaved";
import { errorMessage } from "../../utils/errorMessage";
import { DataTable } from "../../ui/DataTable";
import { CenterSpinner } from "./CenterSpinner";
import { isSystemKeyspaceName } from "../../utils/feature/scylla/keyspaceScope.utils";
import { isSafeCqlIdent } from "./resourcePanels/safeCqlIdent.utils";
import { useScyllaRowsQuery } from "./resourcePanels/useScyllaRowsQuery.hook";
import { ConnectionRootPanel } from "./ConnectionRootPanel";
import { TableResourcePanel } from "./TableResourcePanel";
import "./WorkspaceResourcePanel.css";

type RouterProps = {
  payload: WorkspaceResourcePayload;
  savedConn: SavedConnection | undefined;
  live: LiveSession | undefined;
};

export function WorkspaceResourceRouter({ payload, savedConn, live }: RouterProps) {
  if (!savedConn) {
    return <p className="dataWorkspace__muted">Подключение не найдено в списке сохранённых.</p>;
  }
  if (live == null || live.status !== "connected") {
    return <p className="dataWorkspace__muted">Сначала подключитесь к кластеру (статус в дереве).</p>;
  }

  const connectionParams = paramsFromSaved(savedConn);

  if (payload.resourceType === "CONNECTION_ROOT") {
    return (
      <div className="workspaceResourcePanel">
        <div className="workspaceResourcePanel__body workspaceResourcePanel__body--connectionRoot">
          <ConnectionRootPanel params={connectionParams} live={live} />
        </div>
      </div>
    );
  }

  return (
    <div className="workspaceResourcePanel">
      <div
        className={`workspaceResourcePanel__body${payload.resourceType === "TABLE" ? " workspaceResourcePanel__body--tableResource" : ""}`}
      >
        <ResourceBody payload={payload} params={connectionParams} />
      </div>
    </div>
  );
}

function ResourceBody({
  payload,
  params,
}: {
  payload: WorkspaceResourcePayload;
  params: ConnectionParams;
}) {
  switch (payload.resourceType) {
    case "CONNECTION_ROOT":
      return null;
    case "KEYSPACES_FOLDER":
      return <KeyspacesFolderBody params={params} />;
    case "KEYSPACE":
      return <KeyspaceBody params={params} keyspace={payload.keyspace ?? ""} />;
    case "TABLES_FOLDER":
      return <TablesFolderBody params={params} keyspace={payload.keyspace ?? ""} />;
    case "TABLE":
      return (
        <TableResourcePanel
          connId={payload.connId}
          params={params}
          keyspace={payload.keyspace ?? ""}
          table={payload.table ?? ""}
        />
      );
    case "COLUMNS_FOLDER":
      return <ColumnsFolderBody params={params} keyspace={payload.keyspace ?? ""} table={payload.table ?? ""} />;
    case "COLUMN":
      return (
        <ColumnBody
          params={params}
          keyspace={payload.keyspace ?? ""}
          table={payload.table ?? ""}
          column={payload.column ?? payload.columnDisplay ?? ""}
        />
      );
    case "INDEXES_FOLDER":
      return <IndexesFolderBody params={params} keyspace={payload.keyspace ?? ""} table={payload.table} />;
    case "SECONDARY_INDEX":
      return (
        <IndexDetailBody
          params={params}
          keyspace={payload.keyspace ?? ""}
          table={payload.table}
          indexName={payload.explorerLabel ?? ""}
        />
      );
    case "VIEWS_FOLDER":
      return <ViewsFolderBody params={params} keyspace={payload.keyspace ?? ""} table={payload.table} />;
    case "MATERIALIZED_VIEW":
      return (
        <ViewDetailBody params={params} keyspace={payload.keyspace ?? ""} viewName={payload.explorerLabel ?? ""} />
      );
    case "TYPES_FOLDER":
      return <TypesFolderBody params={params} keyspace={payload.keyspace ?? ""} />;
    case "USER_DEFINED_TYPE":
      return <UdtBody params={params} keyspace={payload.keyspace ?? ""} typeName={payload.explorerLabel ?? ""} />;
    case "FUNCTIONS_ROOT":
      return <StaticDocBody title="Пользовательские функции" body={FUNCTIONS_COPY} />;
    case "FUNCTION":
      return <FunctionBody params={params} functionId={payload.functionId ?? ""} />;
    case "AGGREGATES_ROOT":
      return <StaticDocBody title="Агрегатные функции" body={AGGREGATES_COPY} />;
    case "AGGREGATE":
      return <AggregateBody params={params} aggregateId={payload.aggregateId ?? ""} />;
    case "ROLES_ROOT":
      return <StaticDocBody title="Роли" body={ROLES_COPY} />;
    case "ROLE":
      return <RoleBody params={params} roleName={payload.roleName ?? ""} />;
    case "PERMISSIONS_ROOT":
      return <StaticDocBody title="Права (GRANT)" body={PERMISSIONS_COPY} />;
    case "PERMISSION_GRANT":
      return <PermissionLineBody line={payload.permissionLine ?? ""} />;
    case "SYSTEM_KEYSPACES_FOLDER":
      return <SystemKeyspacesFolderBody params={params} />;
    case "SYSTEM_KEYSPACE":
      return <SystemKeyspaceBody params={params} systemKs={payload.systemKeyspace ?? ""} />;
    case "EXPLORER_FOLDER":
      return <ExplorerFolderBody label={payload.explorerLabel ?? payload.path} />;
  }
}

const FUNCTIONS_COPY =
  "Здесь перечислены пользовательские функции (UDF), определённые в кластере. В Cassandra/Scylla UDF пишутся на JavaScript или Lua (зависит от конфигурации). Полезные запросы: SELECT * FROM system_schema.functions; — список с сигнатурами и языком.";

const AGGREGATES_COPY =
  "User-defined aggregates (UDA) комбинируют state function и final function. См. system_schema.aggregates для полного списка и типов аргументов.";

const ROLES_COPY =
  "Роли используются в RBAC (если включён). См. system_schema.roles, system_auth.role_permissions. Для отладки прав часто смотрят GRANT на keyspace/table.";

const PERMISSIONS_COPY =
  "Список grant-строк из дерева отражает выдачу прав. Детали зависят от версии: в open-source Scylla часть RBAC может отличаться от Cassandra.";

const KS_META_CQL = "SELECT keyspace_name, durable_writes, replication FROM system_schema.keyspaces";

function KeyspacesFolderBody({ params }: { params: ReturnType<typeof paramsFromSaved> }) {
  const q = useScyllaRowsQuery({
    queryKey: ["schema", "keyspacesMeta"],
    params,
    cql: KS_META_CQL,
    currentKeyspace: null,
    enabled: true,
  });

  const table = useMemo(() => {
    const raw = (q.data?.rows ?? []).filter(
      (r) => !isSystemKeyspaceName(String(r.keyspace_name ?? "")),
    );
    const sorted = [...raw].sort((a, b) =>
      String(a.keyspace_name ?? "").localeCompare(String(b.keyspace_name ?? "")),
    );
    const rows = sorted.map((r) => ({
      Keyspace: r.keyspace_name,
      "Durable writes": r.durable_writes,
      Replication: r.replication,
    }));
    return {
      columns: ["Keyspace", "Durable writes", "Replication"],
      rows,
    };
  }, [q.data?.rows]);

  if (q.isPending) {
    return <CenterSpinner />;
  }
  if (q.isError) {
    return <p className="dataWorkspace__muted">{errorMessage(q.error)}</p>;
  }
  if (q.data?.notice) {
    return <p className="workspaceResourcePanel__notice">{q.data.notice}</p>;
  }

  return (
    <div className="workspaceResourcePanel__scroll">
      <DataTable columns={table.columns} rows={table.rows} />
    </div>
  );
}

function SystemKeyspacesFolderBody({ params }: { params: ReturnType<typeof paramsFromSaved> }) {
  const q = useScyllaRowsQuery({
    queryKey: ["schema", "keyspacesMeta"],
    params,
    cql: KS_META_CQL,
    currentKeyspace: null,
    enabled: true,
  });

  const table = useMemo(() => {
    const raw = (q.data?.rows ?? []).filter((r) =>
      isSystemKeyspaceName(String(r.keyspace_name ?? "")),
    );
    const sorted = [...raw].sort((a, b) =>
      String(a.keyspace_name ?? "").localeCompare(String(b.keyspace_name ?? "")),
    );
    const rows = sorted.map((r) => ({
      Keyspace: r.keyspace_name,
      "Durable writes": r.durable_writes,
      Replication: r.replication,
    }));
    return {
      columns: ["Keyspace", "Durable writes", "Replication"],
      rows,
    };
  }, [q.data?.rows]);

  if (q.isPending) {
    return <CenterSpinner />;
  }
  if (q.isError) {
    return <p className="dataWorkspace__muted">{errorMessage(q.error)}</p>;
  }
  if (q.data?.notice) {
    return <p className="workspaceResourcePanel__notice">{q.data.notice}</p>;
  }

  return (
    <div className="workspaceResourcePanel__scroll">
      <DataTable columns={table.columns} rows={table.rows} />
    </div>
  );
}

function KeyspaceBody({ params, keyspace }: { params: ReturnType<typeof paramsFromSaved>; keyspace: string }) {
  const ok = isSafeCqlIdent(keyspace);
  const cql = ok
    ? `SELECT keyspace_name, durable_writes, replication FROM system_schema.keyspaces WHERE keyspace_name = '${keyspace}'`
    : "";
  const q = useScyllaRowsQuery({
    queryKey: ["ksMeta", keyspace],
    params,
    cql,
    currentKeyspace: null,
    enabled: ok,
  });
  if (!ok) {
    return <p className="dataWorkspace__muted">Некорректное имя keyspace для запроса метаданных.</p>;
  }
  if (q.isPending) return <CenterSpinner />;
  if (q.isError) {
    return <p className="dataWorkspace__muted">Не удалось загрузить метаданные keyspace.</p>;
  }
  if (q.data?.notice) {
    return <p className="workspaceResourcePanel__notice">{q.data.notice}</p>;
  }
  return (
    <div className="workspaceResourcePanel__scroll">
      <DataTable columns={q.data?.columns ?? []} rows={q.data?.rows ?? []} />
    </div>
  );
}

function TablesFolderBody({ params, keyspace }: { params: ReturnType<typeof paramsFromSaved>; keyspace: string }) {
  const ok = isSafeCqlIdent(keyspace);
  const cql = ok
    ? `SELECT table_name, compaction, compression, caching FROM system_schema.tables WHERE keyspace_name = '${keyspace}'`
    : "";
  const q = useScyllaRowsQuery({
    queryKey: ["tablesFolder", keyspace],
    params,
    cql,
    currentKeyspace: null,
    enabled: ok,
  });
  if (!ok) {
    return <p className="dataWorkspace__muted">Некорректное имя keyspace.</p>;
  }
  if (q.isPending) return <CenterSpinner />;
  if (q.isError) {
    return <p className="dataWorkspace__muted">Не удалось загрузить список таблиц из system_schema.tables.</p>;
  }
  return (
    <div className="workspaceResourcePanel__scroll">
      <DataTable columns={q.data?.columns ?? []} rows={q.data?.rows ?? []} />
    </div>
  );
}

function ColumnsFolderBody({ params, keyspace, table }: { params: ReturnType<typeof paramsFromSaved>; keyspace: string; table: string }) {
  const ok = isSafeCqlIdent(keyspace) && isSafeCqlIdent(table);
  const cql = ok
    ? `SELECT column_name, kind, position, clustering_order, type FROM system_schema.columns WHERE keyspace_name = '${keyspace}' AND table_name = '${table}'`
    : "";
  const q = useScyllaRowsQuery({
    queryKey: ["columnsFolder", keyspace, table],
    params,
    cql,
    currentKeyspace: null,
    enabled: ok,
  });
  if (!ok) {
    return <p className="dataWorkspace__muted">Некорректные идентификаторы.</p>;
  }
  if (q.isPending) return <CenterSpinner />;
  return (
    <div className="workspaceResourcePanel__scroll">
      <p className="dataWorkspace__muted_small">
        Колонки таблицы: <span className="dataWorkspace__mono">partition_key</span>,{" "}
        <span className="dataWorkspace__mono">clustering</span>, обычные и статические поля.
      </p>
      <DataTable columns={q.data?.columns ?? []} rows={q.data?.rows ?? []} />
    </div>
  );
}

function ColumnBody({
  params,
  keyspace,
  table,
  column,
}: {
  params: ReturnType<typeof paramsFromSaved>;
  keyspace: string;
  table: string;
  column: string;
}) {
  const ok = isSafeCqlIdent(keyspace) && isSafeCqlIdent(table) && isSafeCqlIdent(column);
  const cql = ok
    ? `SELECT * FROM system_schema.columns WHERE keyspace_name = '${keyspace}' AND table_name = '${table}' AND column_name = '${column}'`
    : "";
  const q = useScyllaRowsQuery({
    queryKey: ["oneCol", keyspace, table, column],
    params,
    cql,
    currentKeyspace: null,
    enabled: ok,
  });
  if (!ok) {
    return <p className="dataWorkspace__muted">Некорректное имя колонки для фильтра.</p>;
  }
  if (q.isPending) return <CenterSpinner />;
  return (
    <div className="workspaceResourcePanel__scroll">
      <DataTable columns={q.data?.columns ?? []} rows={q.data?.rows ?? []} />
    </div>
  );
}

function IndexesFolderBody({
  params,
  keyspace,
  table,
}: {
  params: ReturnType<typeof paramsFromSaved>;
  keyspace: string;
  table?: string;
}) {
  const hasTable = table != null && table.length > 0;
  const ok = isSafeCqlIdent(keyspace) && (!hasTable || isSafeCqlIdent(table ?? ""));
  const cql = ok
    ? hasTable
      ? `SELECT index_name, kind, table_name, options FROM system_schema.indexes WHERE keyspace_name = '${keyspace}' AND table_name = '${table}' ALLOW FILTERING`
      : `SELECT index_name, kind, table_name, options FROM system_schema.indexes WHERE keyspace_name = '${keyspace}'`
    : "";
  const q = useScyllaRowsQuery({
    queryKey: ["indexesFolder", keyspace, table ?? ""],
    params,
    cql,
    currentKeyspace: null,
    enabled: ok,
  });
  if (!ok) {
    return <p className="dataWorkspace__muted">Некорректное имя keyspace.</p>;
  }
  if (q.isPending) return <CenterSpinner />;
  return (
    <div className="workspaceResourcePanel__scroll">
      <p className="dataWorkspace__muted_small">
        Вторичные индексы (SASI/legacy 2i): целевая таблица и опции в system_schema.indexes.
      </p>
      <DataTable columns={q.data?.columns ?? []} rows={q.data?.rows ?? []} />
    </div>
  );
}

function IndexDetailBody({
  params,
  keyspace,
  table,
  indexName,
}: {
  params: ReturnType<typeof paramsFromSaved>;
  keyspace: string;
  table?: string;
  indexName: string;
}) {
  const safeIdx = indexName.replace(/'/g, "''");
  const hasTable = table != null && table.length > 0;
  const ok = isSafeCqlIdent(keyspace) && (!hasTable || isSafeCqlIdent(table ?? "")) && indexName.length > 0;
  const cql = ok
    ? hasTable
      ? `SELECT * FROM system_schema.indexes WHERE keyspace_name = '${keyspace}' AND table_name = '${table}' AND index_name = '${safeIdx}' ALLOW FILTERING`
      : `SELECT * FROM system_schema.indexes WHERE keyspace_name = '${keyspace}' AND index_name = '${safeIdx}'`
    : "";
  const q = useScyllaRowsQuery({
    queryKey: ["indexDetail", keyspace, table ?? "", indexName],
    params,
    cql,
    currentKeyspace: null,
    enabled: ok,
  });
  if (!ok) {
    return <p className="dataWorkspace__muted">Некорректные параметры индекса.</p>;
  }
  if (q.isPending) return <CenterSpinner />;
  return (
    <div className="workspaceResourcePanel__scroll">
      <DataTable columns={q.data?.columns ?? []} rows={q.data?.rows ?? []} />
    </div>
  );
}

function ViewsFolderBody({
  params,
  keyspace,
  table,
}: {
  params: ReturnType<typeof paramsFromSaved>;
  keyspace: string;
  table?: string;
}) {
  const hasTable = table != null && table.length > 0;
  const ok = isSafeCqlIdent(keyspace) && (!hasTable || isSafeCqlIdent(table ?? ""));
  const cql = ok
    ? hasTable
      ? `SELECT view_name, base_table_name, where_clause, include_all_columns FROM system_schema.views WHERE keyspace_name = '${keyspace}' AND base_table_name = '${table}' ALLOW FILTERING`
      : `SELECT view_name, base_table_name, where_clause, include_all_columns FROM system_schema.views WHERE keyspace_name = '${keyspace}'`
    : "";
  const q = useScyllaRowsQuery({
    queryKey: ["viewsFolder", keyspace, table ?? ""],
    params,
    cql,
    currentKeyspace: null,
    enabled: ok,
  });
  if (!ok) {
    return <p className="dataWorkspace__muted">Некорректное имя keyspace.</p>;
  }
  if (q.isPending) return <CenterSpinner />;
  return (
    <div className="workspaceResourcePanel__scroll">
      <p className="dataWorkspace__muted_small">
        Materialized views хранятся в system_schema.views: базовая таблица и условие WHERE.
      </p>
      <DataTable columns={q.data?.columns ?? []} rows={q.data?.rows ?? []} />
    </div>
  );
}

function ViewDetailBody({
  params,
  keyspace,
  viewName,
}: {
  params: ReturnType<typeof paramsFromSaved>;
  keyspace: string;
  viewName: string;
}) {
  const safe = viewName.replace(/'/g, "''");
  const ok = isSafeCqlIdent(keyspace) && viewName.length > 0;
  const cql = ok
    ? `SELECT * FROM system_schema.views WHERE keyspace_name = '${keyspace}' AND view_name = '${safe}'`
    : "";
  const q = useScyllaRowsQuery({
    queryKey: ["viewDetail", keyspace, viewName],
    params,
    cql,
    currentKeyspace: null,
    enabled: ok,
  });
  if (!ok) {
    return <p className="dataWorkspace__muted">Некорректные параметры представления.</p>;
  }
  if (q.isPending) return <CenterSpinner />;
  return (
    <div className="workspaceResourcePanel__scroll">
      <DataTable columns={q.data?.columns ?? []} rows={q.data?.rows ?? []} />
    </div>
  );
}

function TypesFolderBody({ params, keyspace }: { params: ReturnType<typeof paramsFromSaved>; keyspace: string }) {
  const ok = isSafeCqlIdent(keyspace);
  const cql = ok
    ? `SELECT type_name, field_names, field_types FROM system_schema.types WHERE keyspace_name = '${keyspace}'`
    : "";
  const q = useScyllaRowsQuery({
    queryKey: ["typesFolder", keyspace],
    params,
    cql,
    currentKeyspace: null,
    enabled: ok,
  });
  if (!ok) {
    return <p className="dataWorkspace__muted">Некорректное имя keyspace.</p>;
  }
  if (q.isPending) return <CenterSpinner />;
  return (
    <div className="workspaceResourcePanel__scroll">
      <p className="dataWorkspace__muted_small">Пользовательские типы (TYPES): поля и их типы в system_schema.types.</p>
      <DataTable columns={q.data?.columns ?? []} rows={q.data?.rows ?? []} />
    </div>
  );
}

function UdtBody({ params, keyspace, typeName }: { params: ReturnType<typeof paramsFromSaved>; keyspace: string; typeName: string }) {
  const safe = typeName.replace(/'/g, "''");
  const ok = isSafeCqlIdent(keyspace) && typeName.length > 0;
  const cql = ok
    ? `SELECT * FROM system_schema.types WHERE keyspace_name = '${keyspace}' AND type_name = '${safe}'`
    : "";
  const q = useScyllaRowsQuery({
    queryKey: ["udt", keyspace, typeName],
    params,
    cql,
    currentKeyspace: null,
    enabled: ok,
  });
  if (!ok) {
    return <p className="dataWorkspace__muted">Некорректные параметры типа.</p>;
  }
  if (q.isPending) return <CenterSpinner />;
  return (
    <div className="workspaceResourcePanel__scroll">
      <DataTable columns={q.data?.columns ?? []} rows={q.data?.rows ?? []} />
    </div>
  );
}

function FunctionBody({ params, functionId }: { params: ReturnType<typeof paramsFromSaved>; functionId: string }) {
  const cql = `SELECT * FROM system_schema.functions`;
  const q = useScyllaRowsQuery({
    queryKey: ["allFunctions", functionId],
    params,
    cql,
    currentKeyspace: null,
    enabled: functionId.length > 0,
  });
  const rows = useMemo(() => {
    const all = q.data?.rows ?? [];
    return all.filter((r) => JSON.stringify(r).includes(functionId));
  }, [q.data?.rows, functionId]);
  if (q.isPending) return <CenterSpinner />;
  return (
    <div className="workspaceResourcePanel__scroll">
      <p className="dataWorkspace__muted_small">
        Полный каталог: <span className="dataWorkspace__mono">system_schema.functions</span>. Строка отфильтрована по идентификатору из дерева.
      </p>
      <DataTable columns={q.data?.columns ?? []} rows={rows} />
    </div>
  );
}

function AggregateBody({ params, aggregateId }: { params: ReturnType<typeof paramsFromSaved>; aggregateId: string }) {
  const cql = `SELECT * FROM system_schema.aggregates`;
  const q = useScyllaRowsQuery({
    queryKey: ["allAggs", aggregateId],
    params,
    cql,
    currentKeyspace: null,
    enabled: aggregateId.length > 0,
  });
  const rows = useMemo(() => {
    const all = q.data?.rows ?? [];
    return all.filter((r) => JSON.stringify(r).includes(aggregateId));
  }, [q.data?.rows, aggregateId]);
  if (q.isPending) return <CenterSpinner />;
  return (
    <div className="workspaceResourcePanel__scroll">
      <DataTable columns={q.data?.columns ?? []} rows={rows} />
    </div>
  );
}

function RoleBody({ params, roleName }: { params: ReturnType<typeof paramsFromSaved>; roleName: string }) {
  const safe = roleName.replace(/'/g, "''");
  const cql = `SELECT * FROM system_schema.roles WHERE role_name = '${safe}'`;
  const q = useScyllaRowsQuery({
    queryKey: ["role", roleName],
    params,
    cql,
    currentKeyspace: null,
    enabled: roleName.length > 0,
  });
  if (q.isPending) return <CenterSpinner />;
  if (q.isError) {
    return (
      <p className="dataWorkspace__muted">
        Не удалось прочитать system_schema.roles (таблица может отсутствовать в этой сборке).
      </p>
    );
  }
  return (
    <div className="workspaceResourcePanel__scroll">
      <DataTable columns={q.data?.columns ?? []} rows={q.data?.rows ?? []} />
    </div>
  );
}

function SystemKeyspaceBody({ params, systemKs }: { params: ReturnType<typeof paramsFromSaved>; systemKs: string }) {
  const safe = systemKs.replace(/'/g, "''");
  const cql = `SELECT * FROM system_schema.keyspaces WHERE keyspace_name = '${safe}'`;
  const q = useScyllaRowsQuery({
    queryKey: ["sysKs", systemKs],
    params,
    cql,
    currentKeyspace: null,
    enabled: systemKs.length > 0,
  });
  if (q.isPending) return <CenterSpinner />;
  return (
    <div className="workspaceResourcePanel__scroll">
      <DataTable columns={q.data?.columns ?? []} rows={q.data?.rows ?? []} />
    </div>
  );
}

function StaticDocBody({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h3 className="dataWorkspace__browseHint">{title}</h3>
      <p className="dataWorkspace__muted_small">{body}</p>
    </div>
  );
}

function PermissionLineBody({ line }: { line: string }) {
  return (
    <div>
      <p className="dataWorkspace__muted_small">Строка grant из обхода схемы:</p>
      <pre className="dataWorkspace__mono" style={{ whiteSpace: "pre-wrap", fontSize: "var(--font-size-sm)" }}>
        {line}
      </pre>
    </div>
  );
}

function ExplorerFolderBody({ label }: { label: string }) {
  return (
    <p className="dataWorkspace__muted_small">
      Узел проводника «{label}». Откройте CQL-вкладку для произвольных запросов к метаданным или данным.
    </p>
  );
}
