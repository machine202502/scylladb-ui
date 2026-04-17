import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import type { ConnectionParams, JsonRow } from "../../types/scylla/scylla.types";
import { DataTable } from "../../ui/DataTable";
import { TableDataCrud } from "./TableDataCrud";
import { VerticalPropertyTable } from "../../ui/VerticalPropertyTable";
import { useToast } from "../../ui/useToast.hook";
import { errorMessage } from "../../utils/errorMessage";
import { quoteCqlIdent, valueToCqlLiteral } from "../../utils/feature/scylla/cqlDataLiteral.utils";
import { CqlValueFactory } from "../../utils/feature/scylla/cqlRecordModel";
import type { FormCellValue } from "./TableFormFieldControl";
import { CenterSpinner } from "./CenterSpinner";
import { isSafeCqlIdent } from "./resourcePanels/safeCqlIdent.utils";
import { useScyllaPreviewQuery } from "./resourcePanels/useScyllaPreviewQuery.hook";
import { useScyllaRowsQuery } from "./resourcePanels/useScyllaRowsQuery.hook";
import "./TableResourcePanel.css";

type TableTabId = "data" | "columns" | "info" | "keys" | "indexes";

const TABS: { id: TableTabId; label: string }[] = [
  { id: "data", label: "Data" },
  { id: "columns", label: "Columns" },
  { id: "info", label: "Info" },
  { id: "keys", label: "Primary keys" },
  { id: "indexes", label: "Indexes" },
];

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200] as const;

function parseCountRow(row: JsonRow | undefined): number | null {
  if (row == null || typeof row !== "object") return null;
  const o = row as Record<string, unknown>;
  const v = o.total ?? o.count ?? o.cnt;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function sortKeyRows(rows: JsonRow[]): JsonRow[] {
  const kindRank = (k: string) => (k === "partition_key" ? 0 : k === "clustering" ? 1 : 2);
  return [...rows].sort((a, b) => {
    const ra = a as Record<string, unknown>;
    const rb = b as Record<string, unknown>;
    const ka = String(ra.kind ?? "");
    const kb = String(rb.kind ?? "");
    const d = kindRank(ka) - kindRank(kb);
    if (d !== 0) return d;
    return Number(ra.position ?? 0) - Number(rb.position ?? 0);
  });
}

type Props = {
  connId: number;
  params: ConnectionParams;
  keyspace: string;
  table: string;
};

export function TableResourcePanel({ connId, params, keyspace, table }: Props) {
  const queryClient = useQueryClient();
  const { notifyError } = useToast();
  const [tab, setTab] = useState<TableTabId>("data");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  /** When false, total row count is unknown and pagination is unbounded (Next while current page is full). */
  const [totalCounted, setTotalCounted] = useState(false);
  const [recordMode, setRecordMode] = useState(false);
  const [recordShowTypes, setRecordShowTypes] = useState(false);
  const [recordEditingColumn, setRecordEditingColumn] = useState<string | null>(null);
  const [recordEditingValue, setRecordEditingValue] = useState<FormCellValue>(null);
  const [recordFieldStageNonce, setRecordFieldStageNonce] = useState(0);
  const [recordFieldStagePayload, setRecordFieldStagePayload] = useState<{
    column: string;
    value: FormCellValue;
  } | null>(null);
  const [selectedRow, setSelectedRow] = useState<JsonRow | null>(null);
  const [recordUnstageTrigger, setRecordUnstageTrigger] = useState(0);
  const [recordDeleteTrigger, setRecordDeleteTrigger] = useState(0);
  const [recordSelectionState, setRecordSelectionState] = useState({
    selectedCount: 0,
    selectedPendingInsert: false,
    selectedPendingDelete: false,
    selectedPendingUpdate: false,
    canUnstage: false,
    selectedStagedValues: null as Record<string, string | null> | null,
    selectedInsertValues: null as Record<string, string | null> | null,
  });
  /** Long driver errors are kept in React Query; this only collapses the on-screen dump. */
  const [previewErrorDetailsCollapsed, setPreviewErrorDetailsCollapsed] = useState(false);

  const ok = isSafeCqlIdent(keyspace) && isSafeCqlIdent(table);

  const offset = (page - 1) * pageSize;

  useEffect(() => {
    setPage(1);
  }, [keyspace, table, pageSize]);

  useEffect(() => {
    setTotalCounted(false);
  }, [keyspace, table, pageSize]);
  useEffect(() => {
    setRecordMode(false);
    setSelectedRow(null);
  }, [keyspace, table]);

  useEffect(() => {
    setPreviewErrorDetailsCollapsed(false);
  }, [connId, keyspace, table, pageSize, page]);

  const countCql = ok ? `SELECT COUNT(*) AS total FROM "${keyspace}"."${table}"` : "";
  const countQ = useScyllaRowsQuery({
    queryKey: ["tableRowCount", keyspace, table],
    params: ok ? params : null,
    cql: countCql,
    currentKeyspace: null,
    enabled: ok && totalCounted,
  });

  const totalRows =
    totalCounted && countQ.data?.rows?.[0] != null ? parseCountRow(countQ.data.rows[0]) : null;

  const previewQ = useScyllaPreviewQuery({
    connId,
    params: ok ? params : null,
    keyspace,
    table,
    limit: pageSize,
    offset,
    enabled: ok && tab === "data",
  });

  const previewErrorText = previewQ.isError ? errorMessage(previewQ.error) : null;
  useEffect(() => {
    if (previewQ.isError && previewQ.error != null) {
      notifyError(previewQ.error);
    }
  }, [previewQ.isError, previewQ.error, notifyError]);

  const columnsCql = ok
    ? `SELECT column_name, kind, position, clustering_order, type FROM system_schema.columns WHERE keyspace_name = '${keyspace}' AND table_name = '${table}'`
    : "";
  const columnsQ = useScyllaRowsQuery({
    queryKey: ["tableCols", keyspace, table],
    params: ok ? params : null,
    cql: columnsCql,
    currentKeyspace: null,
    enabled: ok && (tab === "data" || tab === "columns"),
  });

  const infoCql = ok
    ? `SELECT * FROM system_schema.tables WHERE keyspace_name = '${keyspace}' AND table_name = '${table}'`
    : "";
  const infoQ = useScyllaRowsQuery({
    queryKey: ["tableInfo", keyspace, table],
    params: ok ? params : null,
    cql: infoCql,
    currentKeyspace: null,
    enabled: ok && tab === "info",
  });

  const keysCql = ok
    ? `SELECT column_name, kind, position, clustering_order, type FROM system_schema.columns WHERE keyspace_name = '${keyspace}' AND table_name = '${table}' AND kind IN ('partition_key', 'clustering') ALLOW FILTERING`
    : "";
  const keysQ = useScyllaRowsQuery({
    queryKey: ["tablePrimaryKeys", keyspace, table],
    params: ok ? params : null,
    cql: keysCql,
    currentKeyspace: null,
    enabled: ok && tab === "keys",
  });

  const keysRowsSorted = useMemo(() => sortKeyRows(keysQ.data?.rows ?? []), [keysQ.data?.rows]);

  const indexesCql = ok
    ? `SELECT index_name, kind, table_name, options FROM system_schema.indexes WHERE keyspace_name = '${keyspace}' AND table_name = '${table}' ALLOW FILTERING`
    : "";
  const indexesQ = useScyllaRowsQuery({
    queryKey: ["tableIndexes", keyspace, table],
    params: ok ? params : null,
    cql: indexesCql,
    currentKeyspace: null,
    enabled: ok && tab === "indexes",
  });

  useEffect(() => {
    if (!totalCounted || totalRows == null || totalRows <= 0) return;
    const maxPage = Math.max(1, Math.ceil(totalRows / pageSize));
    if (page > maxPage) setPage(maxPage);
  }, [totalCounted, totalRows, pageSize, page]);

  if (!ok) {
    return <p className="dataWorkspace__muted">Invalid keyspace or table identifier.</p>;
  }

  const rowCount = previewQ.data?.rows?.length ?? 0;
  const dataRows = previewQ.data?.rows ?? [];
  const typeByColumn = useMemo(() => {
    const out: Record<string, string> = {};
    for (const r of columnsQ.data?.rows ?? []) {
      const o = r as Record<string, unknown>;
      const name = String(o.column_name ?? "");
      if (!name) continue;
      out[name] = String(o.type ?? "");
    }
    return out;
  }, [columnsQ.data?.rows]);
  const selectedRowIndex = selectedRow == null ? -1 : dataRows.findIndex((r) => r === selectedRow);
  const rangeStart = rowCount === 0 ? 0 : offset + 1;
  const rangeEnd = offset + rowCount;
  const maxPage =
    totalCounted && totalRows != null && totalRows > 0 ? Math.max(1, Math.ceil(totalRows / pageSize)) : null;
  const canPrev = page > 1;
  const canNext =
    maxPage != null ? page < maxPage : rowCount >= pageSize && rowCount > 0;
  const canRecordPrev = recordMode && selectedRowIndex > 0;
  const canRecordNext = recordMode && selectedRowIndex >= 0 && selectedRowIndex < dataRows.length - 1;
  const recordRow = useMemo(() => {
    if (selectedRow != null) {
      if (recordSelectionState.selectedStagedValues == null) return selectedRow;
      const next: JsonRow = { ...selectedRow };
      for (const [k, v] of Object.entries(recordSelectionState.selectedStagedValues)) {
        next[k] = v;
      }
      return next;
    }
    if (recordSelectionState.selectedInsertValues != null) {
      return { ...recordSelectionState.selectedInsertValues };
    }
    return null;
  }, [selectedRow, recordSelectionState.selectedStagedValues, recordSelectionState.selectedInsertValues]);
  const recordChangedFields = useMemo(
    () => {
      if (recordSelectionState.selectedPendingInsert) {
        // Insert record already has green container background; keep field rows neutral.
        return new Set<string>();
      }
      return new Set(Object.keys(recordSelectionState.selectedStagedValues ?? {}));
    },
    [
      recordSelectionState.selectedPendingInsert,
      recordSelectionState.selectedStagedValues,
      recordSelectionState.selectedInsertValues,
    ],
  );
  const recordFieldStageRequest = useMemo(() => {
    if (recordFieldStagePayload == null || recordFieldStageNonce === 0) return null;
    return {
      nonce: recordFieldStageNonce,
      column: recordFieldStagePayload.column,
      value: recordFieldStagePayload.value,
    };
  }, [recordFieldStagePayload, recordFieldStageNonce]);

  useEffect(() => {
    if (!recordMode) return;
    if (recordSelectionState.selectedCount > 0) return;
    setRecordMode(false);
    setRecordEditingColumn(null);
    setRecordEditingValue(null);
  }, [recordMode, recordSelectionState.selectedCount]);

  const onDataRefresh = () => {
    flushSync(() => {
      setPage(1);
    });
    void queryClient.invalidateQueries({ queryKey: ["scyllaPreview", connId, keyspace, table] });
    if (totalCounted) {
      void queryClient.invalidateQueries({ queryKey: ["tableRowCount", keyspace, table] });
    }
  };

  const onCountRows = () => {
    flushSync(() => {
      setTotalCounted(true);
    });
    void queryClient.invalidateQueries({ queryKey: ["tableRowCount", keyspace, table] });
  };

  const onDataMutateSuccess = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["scyllaPreview", connId, keyspace, table] });
    if (totalCounted) {
      void queryClient.invalidateQueries({ queryKey: ["tableRowCount", keyspace, table] });
    }
  }, [queryClient, connId, keyspace, table, totalCounted]);

  const copyRecordJson = useCallback(async () => {
    if (recordRow == null) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(recordRow, null, 2));
    } catch (e) {
      notifyError(e);
    }
  }, [recordRow, notifyError]);

  const copyRecordCql = useCallback(async () => {
    if (recordRow == null) return;
    try {
      const cols = previewQ.data?.columns ?? [];
      const schema = columnsQ.data?.rows ?? [];
      const typeByName = new Map<string, string>();
      for (const r of schema) {
        const o = r as Record<string, unknown>;
        typeByName.set(String(o.column_name ?? ""), String(o.type ?? "text"));
      }
      const names: string[] = [];
      const vals: string[] = [];
      for (const c of cols) {
        names.push(quoteCqlIdent(c));
        vals.push(valueToCqlLiteral(recordRow[c], typeByName.get(c) ?? "text"));
      }
      const cql = `INSERT INTO ${quoteCqlIdent(keyspace)}.${quoteCqlIdent(table)} (${names.join(", ")}) VALUES (${vals.join(", ")})`;
      await navigator.clipboard.writeText(cql);
    } catch (e) {
      notifyError(e);
    }
  }, [recordRow, previewQ.data?.columns, columnsQ.data?.rows, keyspace, table, notifyError]);

  return (
    <div className="tableResource">
      <div className="tableResource__tabs" role="tablist" aria-label="Table sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`tableResource__tabBtn${tab === t.id ? " tableResource__tabBtn_active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="tableResource__panel" role="tabpanel">
        <div className={`tableResource__section${tab === "data" ? "" : " tableResource__hidden"}`}>
            {!recordMode && <div className="tableResource__dataToolbar">
              <label>
                <span>Page size</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  aria-label="Page size"
                >
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <span aria-live="polite">
                {!totalCounted && "Total rows: unknown"}
                {totalCounted && countQ.isPending && "Counting rows…"}
                {totalCounted && !countQ.isPending && countQ.isError && "Total rows: unavailable (COUNT failed)."}
                {totalCounted && !countQ.isPending && !countQ.isError && totalRows != null && (
                  <>
                    Total rows: <strong>{totalRows.toLocaleString("en-US")}</strong>
                  </>
                )}
                {totalCounted && !countQ.isPending && !countQ.isError && totalRows == null && countQ.data?.notice && (
                  <>Total rows: unavailable</>
                )}
              </span>
              <div className="tableResource__pager">
                <button type="button" disabled={!canPrev} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  Previous
                </button>
                <span>
                  Page {page}
                  {maxPage != null ? ` / ${maxPage}` : ""}
                </span>
                <button type="button" disabled={!canNext} onClick={() => setPage((p) => p + 1)}>
                  Next
                </button>
              </div>
              <button
                type="button"
                className="tableResource__refreshBtn"
                onClick={onDataRefresh}
                disabled={previewQ.isFetching}
                aria-label="Refresh data"
              >
                Refresh
              </button>
              <button
                type="button"
                className="tableResource__refreshBtn"
                onClick={onCountRows}
                disabled={!totalCounted ? false : countQ.isFetching}
                aria-label="Count total rows to bound pagination"
              >
                Count rows
              </button>
              <span aria-live="polite">
                {previewQ.isPending
                  ? "Loading…"
                  : rowCount === 0
                    ? "No rows in this range."
                    : `Rows ${rangeStart.toLocaleString("en-US")}–${rangeEnd.toLocaleString("en-US")}${
                        totalCounted && totalRows != null ? ` of ${totalRows.toLocaleString("en-US")}` : ""
                      }`}
              </span>
            </div>}
            {recordMode && (
              <div className="tableResource__dataToolbar">
                <div className="tableResource__pager">
                  <button
                    type="button"
                    disabled={!canRecordPrev}
                    onClick={() => {
                      if (selectedRowIndex <= 0) return;
                      setSelectedRow(dataRows[selectedRowIndex - 1] ?? null);
                    }}
                  >
                    Previous
                  </button>
                  <span>
                    Record {selectedRowIndex >= 0 ? selectedRowIndex + 1 : 0}
                    {` / ${dataRows.length}`}
                  </span>
                  <button
                    type="button"
                    disabled={!canRecordNext}
                    onClick={() => {
                      if (selectedRowIndex < 0 || selectedRowIndex >= dataRows.length - 1) return;
                      setSelectedRow(dataRows[selectedRowIndex + 1] ?? null);
                    }}
                  >
                    Next
                  </button>
                </div>
                <label>
                  <input
                    type="checkbox"
                    checked={recordShowTypes}
                    onChange={(e) => setRecordShowTypes(e.target.checked)}
                  />
                  <span>Show types</span>
                </label>
              </div>
            )}
            {previewQ.isPending ? (
              <CenterSpinner />
            ) : previewQ.isError ? (
              <div className="tableResource__previewError">
                <p
                  className={`dataWorkspace__muted${previewErrorDetailsCollapsed ? "" : " tableResource__previewErrorDetail"}`}
                >
                  {previewErrorDetailsCollapsed
                    ? "Failed to load rows."
                    : `Failed to load rows.${previewErrorText ? ` ${previewErrorText}` : ""}`}
                </p>
                <div className="tableResource__previewErrorActions">
                  <button
                    type="button"
                    className="tableResource__refreshBtn"
                    onClick={() => {
                      setPreviewErrorDetailsCollapsed(false);
                      void queryClient.invalidateQueries({
                        queryKey: ["scyllaPreview", connId, keyspace, table],
                      });
                    }}
                    disabled={previewQ.isFetching}
                  >
                    Retry
                  </button>
                  <button
                    type="button"
                    className="tableResource__refreshBtn"
                    onClick={() => setPreviewErrorDetailsCollapsed((v) => !v)}
                  >
                    {previewErrorDetailsCollapsed ? "Show details" : "Hide details"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="tableResource__dataArea">
                <button
                  type="button"
                  className={`tableResource__recordBtn${recordMode ? " tableResource__recordBtn_active" : ""}`}
                  disabled={!recordMode && recordRow == null && recordSelectionState.selectedCount !== 1}
                  onClick={() => setRecordMode((v) => !v)}
                  aria-label={recordMode ? "List view" : "Show selected record"}
                >
                  {recordMode ? "List" : "Record"}
                </button>
                <div className="tableResource__dataContent">
                  <div className={`tableResource__dataPane${recordMode ? " tableResource__hidden" : ""}`}>
                    <TableDataCrud
                      params={params}
                      keyspace={keyspace}
                      table={table}
                      dataColumns={previewQ.data?.columns ?? []}
                      dataRows={previewQ.data?.rows ?? []}
                      schemaRows={columnsQ.data?.rows ?? []}
                      schemaError={columnsQ.isError}
                      schemaLoading={columnsQ.isPending}
                      onMutateSuccess={onDataMutateSuccess}
                      forcedSelectedRow={selectedRow}
                      unstageTrigger={recordUnstageTrigger}
                      deleteTrigger={recordDeleteTrigger}
                      onRecordSelectionStateChange={setRecordSelectionState}
                      recordFieldStageRequest={recordFieldStageRequest}
                      onSelectedRowChange={(r) => {
                        setSelectedRow(r);
                        setRecordEditingColumn(null);
                        setRecordEditingValue(null);
                      }}
                    />
                  </div>
                  <div className={`tableResource__dataPane${recordMode ? "" : " tableResource__hidden"}`}>
                    {recordRow != null ? (
                      <>
                        <div
                          className={`tableResource__scroll${
                            recordSelectionState.selectedPendingDelete
                              ? " tableResource__scroll--pendingDelete"
                              : recordSelectionState.selectedPendingInsert
                                ? " tableResource__scroll--pendingInsert"
                              : recordSelectionState.selectedPendingUpdate
                                ? " tableResource__scroll--pendingUpdate"
                                : ""
                          }`}
                        >
                          <VerticalPropertyTable
                            columns={previewQ.data?.columns ?? []}
                            row={recordRow}
                            highlightedFields={recordChangedFields}
                            showTypes={recordShowTypes}
                            typeByColumn={typeByColumn}
                            editingColumn={recordEditingColumn}
                            editingValue={recordEditingValue}
                            onEditingValueChange={setRecordEditingValue}
                            onStartEdit={(column) => {
                              if (recordRow == null) return;
                              const cqlType = typeByColumn[column];
                              if (!cqlType) return;
                              try {
                                setRecordEditingColumn(column);
                                if (recordSelectionState.selectedPendingInsert) {
                                  setRecordEditingValue(recordSelectionState.selectedInsertValues?.[column] ?? null);
                                  return;
                                }
                                if (
                                  recordSelectionState.selectedStagedValues != null &&
                                  Object.prototype.hasOwnProperty.call(recordSelectionState.selectedStagedValues, column)
                                ) {
                                  setRecordEditingValue(recordSelectionState.selectedStagedValues[column] ?? null);
                                  return;
                                }
                                if (selectedRow == null) {
                                  throw new Error("No source DB row for record editor.");
                                }
                                const raw = CqlValueFactory.fromDbValue(selectedRow[column], cqlType).toVisual();
                                setRecordEditingValue(raw.editor.mode === "null" ? null : raw.editor.rawText);
                              } catch (e) {
                                notifyError(e);
                              }
                            }}
                            onCancelEdit={() => {
                              setRecordEditingColumn(null);
                              setRecordEditingValue(null);
                            }}
                            onCommitEdit={(column) => {
                              if (recordRow == null) return;
                              setRecordFieldStagePayload({ column, value: recordEditingValue });
                              setRecordFieldStageNonce((n) => n + 1);
                              setRecordEditingColumn(null);
                              setRecordEditingValue(null);
                            }}
                          />
                        </div>
                        <div className="tableDataCrud__toolbar tableDataCrud__toolbar--bottom">
                          <button
                            type="button"
                            className="tableDataCrud__btn tableDataCrud__btn_delete"
                            disabled={recordSelectionState.selectedCount !== 1 || recordSelectionState.selectedPendingDelete}
                            onClick={() => setRecordDeleteTrigger((n) => n + 1)}
                          >
                            Delete
                          </button>
                          <button
                            type="button"
                            className="tableDataCrud__btn"
                            disabled={!recordSelectionState.canUnstage}
                            onClick={() => setRecordUnstageTrigger((n) => n + 1)}
                          >
                            Unstage
                          </button>
                          <span className="tableDataCrud__toolbarSpacer" />
                          <button
                            type="button"
                            className="tableDataCrud__btn"
                            disabled={recordRow == null}
                            onClick={() => {
                              void copyRecordCql();
                            }}
                          >
                            Copy CQL
                          </button>
                          <button
                            type="button"
                            className="tableDataCrud__btn"
                            disabled={recordRow == null}
                            onClick={() => {
                              void copyRecordJson();
                            }}
                          >
                            Copy JSON
                          </button>
                        </div>
                      </>
                    ) : (
                      <p className="dataWorkspace__muted">Select one record.</p>
                    )}
                  </div>
                </div>
              </div>
            )}
        </div>

        <div className={`tableResource__section${tab === "columns" ? "" : " tableResource__hidden"}`}>
          {columnsQ.isPending ? (
            <CenterSpinner />
          ) : columnsQ.isError ? (
            <p className="dataWorkspace__muted">Failed to load columns.</p>
          ) : (
            <div className="tableResource__scroll">
              <DataTable columns={columnsQ.data?.columns ?? []} rows={columnsQ.data?.rows ?? []} />
            </div>
          )}
        </div>

        <div className={`tableResource__section${tab === "info" ? "" : " tableResource__hidden"}`}>
          {infoQ.isPending ? (
            <CenterSpinner />
          ) : infoQ.isError ? (
            <p className="dataWorkspace__muted">Failed to load table metadata.</p>
          ) : infoQ.data?.notice ? (
            <p className="workspaceResourcePanel__notice">{infoQ.data.notice}</p>
          ) : infoQ.data?.rows?.[0] != null ? (
            <div className="tableResource__scroll">
              <VerticalPropertyTable columns={infoQ.data.columns} row={infoQ.data.rows[0]} />
            </div>
          ) : (
            <p className="dataWorkspace__muted">No metadata row.</p>
          )}
        </div>

        <div className={`tableResource__section${tab === "keys" ? "" : " tableResource__hidden"}`}>
          {keysQ.isPending ? (
            <CenterSpinner />
          ) : keysQ.isError ? (
            <p className="dataWorkspace__muted">Failed to load primary key columns.</p>
          ) : (
            <div className="tableResource__scroll">
              <DataTable columns={keysQ.data?.columns ?? []} rows={keysRowsSorted} />
            </div>
          )}
        </div>

        <div className={`tableResource__section${tab === "indexes" ? "" : " tableResource__hidden"}`}>
          {indexesQ.isPending ? (
            <CenterSpinner />
          ) : indexesQ.isError ? (
            <p className="dataWorkspace__muted">Failed to load indexes.</p>
          ) : (
            <div className="tableResource__scroll">
              <DataTable columns={indexesQ.data?.columns ?? []} rows={indexesQ.data?.rows ?? []} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
