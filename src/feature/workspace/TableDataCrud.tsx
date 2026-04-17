import { useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import type { ConnectionParams, JsonRow } from "../../types/scylla/scylla.types";
import { logUiClick, tauriInvoke } from "../../utils/appLogger";
import { parseScyllaCqlInvokeResult } from "../../utils/feature/query/parseScyllaCqlResult.utils";
import {
  cqlLiteralFromFormField,
  baseCqlType,
  quoteCqlIdent,
  valueToCqlLiteral,
} from "../../utils/feature/scylla/cqlDataLiteral.utils";
import { CqlValueFactory, EMPTY_FIELD_NOT_VALID_MSG } from "../../utils/feature/scylla/cqlRecordModel";
import { formatDateTimeLocal } from "../../utils/feature/scylla/formatTimestamp.utils";
import {
  type ColumnMeta,
  columnMetaFromSchemaRows,
  primaryKeyColumns,
  regularAndStaticColumns,
  rowKeySignature,
} from "../../utils/feature/scylla/tableRowSchema.utils";
import { errorMessage } from "../../utils/errorMessage";
import { useToast } from "../../ui/useToast.hook";
import { TableFormFieldControl, type FormCellValue } from "./TableFormFieldControl";
import { TableValueDisplay } from "./TableValueDisplay";
import "./TableDataCrud.css";

async function runCqlVoid(params: ConnectionParams, cql: string): Promise<void> {
  const raw = await tauriInvoke<unknown>("scylla_run_cql", {
    params,
    cql: cql.trim(),
    currentKeyspace: null,
  });
  const p = parseScyllaCqlInvokeResult(raw);
  if (p.kind === "void") return;
  throw new Error("Expected void result from CQL");
}

function buildWhere(row: JsonRow, pk: ColumnMeta[]): string {
  return pk
    .map((c) => {
      const lit = valueToCqlLiteral(row[c.name], c.type);
      return `${quoteCqlIdent(c.name)} = ${lit}`;
    })
    .join(" AND ");
}

function tableRef(ks: string, tbl: string): string {
  return `${quoteCqlIdent(ks)}.${quoteCqlIdent(tbl)}`;
}

type FormValues = Record<string, FormCellValue>;
type StagedInsert = {
  id: string;
  formValues: FormValues;
  anchorAfterKey: string | null;
};

function serializeCellForForm(v: unknown, cqlType: string): FormCellValue {
  const visual = CqlValueFactory.fromDbValue(v, cqlType).toVisual();
  return visual.editor.mode === "null" ? null : visual.editor.rawText;
}

function toCqlLiteralFromFormValue(v: FormCellValue, cqlType: string): string {
  if (v === null) return "NULL";
  return cqlLiteralFromFormField(v, cqlType);
}

function notifyFormFeedback(
  notifyError: (e: unknown) => void,
  notifyWarn: (e: unknown) => void,
  e: unknown,
): void {
  if (errorMessage(e) === EMPTY_FIELD_NOT_VALID_MSG) notifyWarn(e);
  else notifyError(e);
}

function rowKey(row: JsonRow, pkCols: ColumnMeta[], index: number): string {
  return pkCols.length > 0 ? rowKeySignature(row, pkCols) : `row-${index}`;
}

type StagedUpdate = { originalRow: JsonRow; fieldValues: FormValues };

function autoLiteralForEmptyPk(cqlType: string): string | null {
  const t = baseCqlType(cqlType);
  if (t === "uuid") return "uuid()";
  if (t === "timeuuid") return "now()";
  return null;
}

function shouldClearPkOnClone(c: ColumnMeta): boolean {
  // Keep non-unique PK parts from source row; clear only PK parts that are usually unique identifiers.
  if (c.kind !== "partition_key" && c.kind !== "clustering") return false;
  const t = baseCqlType(c.type);
  return t === "uuid" || t === "timeuuid";
}

type Props = {
  params: ConnectionParams;
  keyspace: string;
  table: string;
  dataColumns: string[];
  dataRows: JsonRow[];
  schemaRows: JsonRow[];
  schemaError: boolean;
  schemaLoading: boolean;
  onMutateSuccess: () => void;
  onSelectedRowChange?: (row: JsonRow | null) => void;
  forcedSelectedRow?: JsonRow | null;
  onRecordSelectionStateChange?: (state: {
    selectedCount: number;
    selectedPendingInsert: boolean;
    selectedPendingDelete: boolean;
    selectedPendingUpdate: boolean;
    canUnstage: boolean;
    selectedStagedValues: FormValues | null;
    selectedInsertValues: FormValues | null;
  }) => void;
  unstageTrigger?: number;
  deleteTrigger?: number;
  recordFieldStageRequest?: {
    nonce: number;
    column: string;
    value: FormCellValue;
  } | null;
};

export function TableDataCrud({
  params,
  keyspace,
  table,
  dataColumns,
  dataRows,
  schemaRows,
  schemaError,
  schemaLoading,
  onMutateSuccess,
  onSelectedRowChange,
  forcedSelectedRow,
  onRecordSelectionStateChange,
  unstageTrigger = 0,
  deleteTrigger = 0,
  recordFieldStageRequest = null,
}: Props) {
  const { notifyError, notifyWarn } = useToast();
  const liveMeta = columnMetaFromSchemaRows(schemaRows);
  const livePkCols = primaryKeyColumns(liveMeta);
  const liveDataCols = regularAndStaticColumns(liveMeta);
  const [stableMeta, setStableMeta] = useState<ColumnMeta[]>([]);
  const [stablePkCols, setStablePkCols] = useState<ColumnMeta[]>([]);
  const [stableDataCols, setStableDataCols] = useState<ColumnMeta[]>([]);
  const [onlyStaged, setOnlyStaged] = useState(false);

  useEffect(() => {
    if (liveMeta.length > 0) setStableMeta(liveMeta);
  }, [liveMeta]);
  useEffect(() => {
    if (livePkCols.length > 0) setStablePkCols(livePkCols);
  }, [livePkCols]);
  useEffect(() => {
    if (liveDataCols.length > 0) setStableDataCols(liveDataCols);
  }, [liveDataCols]);

  const meta = stableMeta.length > 0 ? stableMeta : liveMeta;
  const pkCols = stablePkCols.length > 0 ? stablePkCols : livePkCols;
  const dataCols = stableDataCols.length > 0 ? stableDataCols : liveDataCols;

  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [pendingDeleteRows, setPendingDeleteRows] = useState<Map<string, JsonRow>>(() => new Map());
  const [pendingUpdates, setPendingUpdates] = useState<Map<string, StagedUpdate>>(() => new Map());
  const [pendingInserts, setPendingInserts] = useState<StagedInsert[]>([]);

  const [inlineEdit, setInlineEdit] = useState<{ rowKey: string; colName: string } | null>(null);
  const [inlineValue, setInlineValue] = useState<FormCellValue>(null);
  const [pendingAutoSelectKey, setPendingAutoSelectKey] = useState<string | null>(null);
  const [fieldModal, setFieldModal] = useState<{
    mode: "db" | "insert";
    row: JsonRow | null;
    rowKey: string | null;
    insertId: string | null;
    col: ColumnMeta;
    value: FormCellValue;
  } | null>(null);
  const [cellMenu, setCellMenu] = useState<{
    x: number;
    y: number;
    mode: "db" | "insert";
    row: JsonRow | null;
    rowKey: string | null;
    insertId: string | null;
    col: ColumnMeta;
  } | null>(null);
  const [commitConfirmOpen, setCommitConfirmOpen] = useState(false);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const fieldLogTimersRef = useRef<Record<string, number>>({});

  const pageRows = useMemo(
    () => dataRows.map((row, i) => ({ row, key: rowKey(row, pkCols, i) })),
    [dataRows, pkCols],
  );
  const selectedPageRow = selectedKeys.size === 1 ? pageRows.find((x) => selectedKeys.has(x.key)) ?? null : null;

  const metaByName = useMemo(() => {
    const m = new Map<string, ColumnMeta>();
    for (const c of meta) m.set(c.name, c);
    return m;
  }, [meta]);

  const hasStagedChanges =
    pendingDeleteRows.size > 0 || pendingUpdates.size > 0 || pendingInserts.length > 0;

  const commitMut = useMutation({
    mutationFn: async () => {
      for (const row of pendingDeleteRows.values()) {
        await runCqlVoid(
          params,
          `DELETE FROM ${tableRef(keyspace, table)} WHERE ${buildWhere(row, pkCols)}`,
        );
      }
      for (const u of pendingUpdates.values()) {
        const sets: string[] = [];
        for (const [name, raw] of Object.entries(u.fieldValues)) {
          const c = dataCols.find((x) => x.name === name);
          if (!c) continue;
          const lit = toCqlLiteralFromFormValue(raw ?? null, c.type);
          sets.push(`${quoteCqlIdent(c.name)} = ${lit}`);
        }
        if (sets.length === 0) {
          continue;
        }
        const cql = `UPDATE ${tableRef(keyspace, table)} SET ${sets.join(", ")} WHERE ${buildWhere(u.originalRow, pkCols)}`;
        await runCqlVoid(params, cql);
      }
      for (const ins of pendingInserts) {
        const pairs: { col: ColumnMeta; lit: string }[] = [];
        for (const c of meta) {
          const raw = ins.formValues[c.name] ?? null;
          const isPk = c.kind === "partition_key" || c.kind === "clustering";
          let lit = toCqlLiteralFromFormValue(raw, c.type);
          if (isPk && (raw == null || raw.trim() === "")) {
            const auto = autoLiteralForEmptyPk(c.type);
            if (auto) lit = auto;
          }
          if (isPk && lit === "NULL") {
            throw new Error(`Insert missing primary key: ${c.name}`);
          }
          pairs.push({ col: c, lit });
        }
        const names = pairs.map((p) => quoteCqlIdent(p.col.name)).join(", ");
        const values = pairs.map((p) => p.lit).join(", ");
        await runCqlVoid(
          params,
          `INSERT INTO ${tableRef(keyspace, table)} (${names}) VALUES (${values})`,
        );
      }
    },
    onSuccess: () => {
      setPendingDeleteRows(new Map());
      setPendingUpdates(new Map());
      setPendingInserts([]);
      setSelectedKeys(new Set());
      onMutateSuccess();
    },
  });

  const canCrud = !schemaLoading && !schemaError && pkCols.length > 0;

  const uiMetaBase = useMemo(
    () => ({
      keyspace,
      table,
    }),
    [keyspace, table],
  );

  const logClick = (name: string, meta: unknown = {}) => {
    logUiClick(name, { ...uiMetaBase, ...(meta as object) });
  };

  const scheduleFieldLog = (fieldKey: string, meta: Record<string, unknown>) => {
    const timers = fieldLogTimersRef.current;
    const prev = timers[fieldKey];
    if (prev) window.clearTimeout(prev);
    timers[fieldKey] = window.setTimeout(() => {
      logUiClick("table.data.field.change", { ...uiMetaBase, ...meta });
      delete timers[fieldKey];
    }, 500);
  };

  const onRowSelect = (k: string, multi: boolean) => {
    logClick("table.data.row.select", { multi, key: k });
    setSelectedKeys((prev) => {
      let next: Set<string>;
      if (multi) {
        next = new Set(prev);
        if (next.has(k)) next.delete(k);
        else next.add(k);
      } else {
        next = new Set([k]);
      }
      if (onSelectedRowChange) {
        if (next.size === 1) {
          const only = [...next][0];
          onSelectedRowChange(pageRows.find((x) => x.key === only)?.row ?? null);
        } else {
          onSelectedRowChange(null);
        }
      }
      return next;
    });
  };

  useEffect(() => {
    if (forcedSelectedRow == null) return;
    if (selectedKeys.size === 1) {
      const only = [...selectedKeys][0];
      if (only.startsWith("ins:")) return;
    }
    const hit = pageRows.find((x) => x.row === forcedSelectedRow);
    if (!hit) return;
    setSelectedKeys(new Set([hit.key]));
  }, [forcedSelectedRow, pageRows, selectedKeys]);

  const unstageSelected = () => {
    if (selectedKeys.size === 0) return;
    logClick("table.data.unstage.selected", { selected: selectedKeys.size });
    const hadSelectedInsert = [...selectedKeys].some((k) => k.startsWith("ins:"));
    setPendingDeleteRows((prev) => {
      const n = new Map(prev);
      selectedKeys.forEach((k) => n.delete(k));
      return n;
    });
    setPendingUpdates((prev) => {
      const n = new Map(prev);
      selectedKeys.forEach((k) => n.delete(k));
      return n;
    });
    setPendingInserts((prev) => prev.filter((x) => !selectedKeys.has(`ins:${x.id}`)));
    if (hadSelectedInsert) {
      setSelectedKeys(new Set());
      onSelectedRowChange?.(null);
    }
  };

  const unstageTriggerPrevRef = useRef(unstageTrigger);
  useEffect(() => {
    if (unstageTrigger === unstageTriggerPrevRef.current) return;
    unstageTriggerPrevRef.current = unstageTrigger;
    unstageSelected();
  }, [unstageTrigger]);

  const deleteTriggerPrevRef = useRef(deleteTrigger);
  useEffect(() => {
    if (deleteTrigger === deleteTriggerPrevRef.current) return;
    deleteTriggerPrevRef.current = deleteTrigger;
    queueDeleteSelected();
  }, [deleteTrigger]);

  const recordFieldStageNonceRef = useRef(0);
  useEffect(() => {
    if (recordFieldStageRequest == null) return;
    if (recordFieldStageRequest.nonce === recordFieldStageNonceRef.current) return;
    recordFieldStageNonceRef.current = recordFieldStageRequest.nonce;
    if (selectedKeys.size !== 1) return;
    const rk = [...selectedKeys][0];
    const col = meta.find((x) => x.name === recordFieldStageRequest.column);
    if (!col) {
      notifyError(new Error(`Unknown column: ${recordFieldStageRequest.column}`));
      return;
    }
    try {
      if (rk.startsWith("ins:")) {
        const insertId = rk.slice(4);
        if (!insertId) {
          throw new Error("Invalid staged insert key.");
        }
        stageInsertField(insertId, col, recordFieldStageRequest.value);
        logClick("table.data.record.field.stage", { key: rk, column: col.name, mode: "insert" });
      } else {
        const target = pageRows.find((x) => x.key === rk);
        if (!target) return;
        stageRowField(target.row, rk, col, recordFieldStageRequest.value);
        logClick("table.data.record.field.stage", { key: rk, column: col.name, mode: "row" });
      }
    } catch (e) {
      notifyFormFeedback(notifyError, notifyWarn, e);
    }
  }, [recordFieldStageRequest, selectedKeys, pageRows, meta, notifyError, notifyWarn]);

  const queueDeleteSelected = () => {
    if (selectedKeys.size === 0) return;
    logClick("table.data.delete.queue", { selected: selectedKeys.size });
    setPendingUpdates((prev) => {
      const u = new Map(prev);
      selectedKeys.forEach((k) => u.delete(k));
      return u;
    });
    setPendingDeleteRows((prev) => {
      const n = new Map(prev);
      pageRows.forEach(({ row, key: k }) => {
        if (selectedKeys.has(k)) {
          n.set(k, row);
        }
      });
      return n;
    });
  };

  const stageRowField = (row: JsonRow, rowKeyValue: string, col: ColumnMeta, value: FormCellValue) => {
    if (pendingDeleteRows.has(rowKeyValue)) {
      throw new Error("Row is staged for delete.");
    }
    if (col.kind === "partition_key" || col.kind === "clustering") {
      throw new Error(
        "CQL UPDATE cannot change partition key or clustering columns — the row is addressed by its primary key. To use a new key, delete this row and insert a new one.",
      );
    }
    toCqlLiteralFromFormValue(value, col.type);
    const staged = pendingUpdates.get(rowKeyValue);
    const fieldValues = staged ? { ...staged.fieldValues } : {};
    fieldValues[col.name] = value;
    setPendingDeleteRows((prev) => {
      const n = new Map(prev);
      n.delete(rowKeyValue);
      return n;
    });
    setPendingUpdates((prev) =>
      new Map(prev).set(rowKeyValue, { originalRow: staged?.originalRow ?? row, fieldValues }),
    );
    scheduleFieldLog(`edit:${rowKeyValue}:${col.name}`, {
      column: col.name,
      type: baseCqlType(col.type),
      len: value?.length ?? 0,
    });
  };

  const stageInsertField = (insertId: string, col: ColumnMeta, value: FormCellValue) => {
    toCqlLiteralFromFormValue(value, col.type);
    setPendingInserts((prev) =>
      prev.map((x) => (x.id === insertId ? { ...x, formValues: { ...x.formValues, [col.name]: value } } : x)),
    );
    scheduleFieldLog(`insert:${insertId}:${col.name}`, {
      column: col.name,
      type: baseCqlType(col.type),
      len: value?.length ?? 0,
    });
  };

  const autoValueForType = (cqlType: string): FormCellValue => {
    const t = baseCqlType(cqlType);
    if (t === "uuid") return crypto.randomUUID();
    if (t === "timeuuid") return "now()";
    if (t === "timestamp") return formatDateTimeLocal(new Date());
    if (t === "date") {
      const d = new Date();
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const yyyy = String(d.getFullYear());
      return `${dd}.${mm}.${yyyy}`;
    }
    if (t === "time") {
      const d = new Date();
      const HH = String(d.getHours()).padStart(2, "0");
      const MI = String(d.getMinutes()).padStart(2, "0");
      const SS = String(d.getSeconds()).padStart(2, "0");
      return `${HH}:${MI}:${SS}`;
    }
    throw new Error(`No auto value for type: ${cqlType}`);
  };

  const openInsert = () => {
    logClick("table.data.insert.stage");
    const next: FormValues = {};
    for (const c of meta) next[c.name] = null;
    const id = crypto.randomUUID();
    const key = `ins:${id}`;
    setPendingInserts((prev) => [...prev, { id, formValues: next, anchorAfterKey: null }]);
    setSelectedKeys(new Set([key]));
    setPendingAutoSelectKey(key);
    onSelectedRowChange?.(null);
  };

  const openCloneSelected = () => {
    if (selectedKeys.size !== 1) return;
    const k = [...selectedKeys][0];
    if (pendingDeleteRows.has(k)) return;

    let sourceValues: FormValues | null = null;
    if (k.startsWith("ins:")) {
      const sourceId = k.slice(4);
      const sourceIns = pendingInserts.find((x) => x.id === sourceId);
      if (!sourceIns) return;
      sourceValues = { ...sourceIns.formValues };
    } else {
      const target = pageRows.find((x) => x.key === k);
      if (!target) return;
      sourceValues = {};
      for (const c of meta) {
        sourceValues[c.name] = serializeCellForForm(target.row[c.name], c.type);
      }
    }

    logClick("table.data.clone.open", { key: k, mode: k.startsWith("ins:") ? "insert" : "row" });
    const next: FormValues = {};
    for (const c of meta) {
      next[c.name] = shouldClearPkOnClone(c)
        ? null
        : (sourceValues[c.name] ?? null);
    }
    const id = crypto.randomUUID();
    const key = `ins:${id}`;
    setPendingInserts((prev) => [...prev, { id, formValues: next, anchorAfterKey: k }]);
    setSelectedKeys(new Set([key]));
    setPendingAutoSelectKey(key);
    onSelectedRowChange?.(null);
  };

  const discardAll = () => {
    if (!hasStagedChanges) return;
    logClick("table.data.discard.open", { deletes: pendingDeleteRows.size, updates: pendingUpdates.size, inserts: pendingInserts.length });
    setDiscardConfirmOpen(true);
  };

  const commitAll = () => {
    if (!hasStagedChanges) return;
    logClick("table.data.commit.open", { deletes: pendingDeleteRows.size, updates: pendingUpdates.size, inserts: pendingInserts.length });
    setCommitConfirmOpen(true);
  };

  const displayCell = (row: JsonRow, col: string, rk: string) => {
    const st = pendingUpdates.get(rk);
    const cm = meta.find((m) => m.name === col);
    const colType = cm?.type;
    if (st && dataCols.some((c) => c.name === col)) {
      const v = st.fieldValues[col];
      if (v !== undefined) {
        return <TableValueDisplay value={v} cqlType={colType} showEmptyMarker />;
      }
    }
    return <TableValueDisplay value={row[col]} cqlType={colType} />;
  };

  const currentCellFormValue = (row: JsonRow, col: ColumnMeta, rk: string): FormCellValue => {
    const st = pendingUpdates.get(rk);
    if (st && Object.prototype.hasOwnProperty.call(st.fieldValues, col.name)) {
      return st.fieldValues[col.name] ?? null;
    }
    return serializeCellForForm(row[col.name], col.type);
  };

  const startInlineEdit = (row: JsonRow, rk: string, col: ColumnMeta) => {
    if (pendingDeleteRows.has(rk)) return;
    if (col.kind === "partition_key" || col.kind === "clustering") return;
    const cur = currentCellFormValue(row, col, rk);
    setInlineEdit({ rowKey: rk, colName: col.name });
    setInlineValue(cur);
    setCellMenu(null);
  };

  const commitInlineEdit = (row: JsonRow, rk: string, col: ColumnMeta) => {
    try {
      stageRowField(row, rk, col, inlineValue);
      logClick("table.data.inline.stage", { key: rk, column: col.name });
    } catch (e) {
      notifyFormFeedback(notifyError, notifyWarn, e);
    } finally {
      setInlineEdit(null);
    }
  };

  const commitInlineInsertEdit = (insertId: string, col: ColumnMeta) => {
    try {
      stageInsertField(insertId, col, inlineValue);
      logClick("table.data.inline.insert.stage", { insertId, column: col.name });
    } catch (e) {
      notifyFormFeedback(notifyError, notifyWarn, e);
    } finally {
      setInlineEdit(null);
    }
  };

  const openCellMenu = (e: MouseEvent, row: JsonRow, rk: string, col: ColumnMeta) => {
    e.preventDefault();
    if (col.kind === "partition_key" || col.kind === "clustering") return;
    if (pendingDeleteRows.has(rk)) return;
    setCellMenu({
      x: e.clientX,
      y: e.clientY,
      mode: "db",
      row,
      rowKey: rk,
      insertId: null,
      col,
    });
  };

  const currentInsertCellFormValue = (insertId: string, colName: string): FormCellValue => {
    const ins = pendingInserts.find((x) => x.id === insertId);
    if (!ins) throw new Error(`Unknown staged insert: ${insertId}`);
    return ins.formValues[colName] ?? null;
  };

  const openInsertCellMenu = (e: MouseEvent, insertId: string, col: ColumnMeta) => {
    e.preventDefault();
    setCellMenu({
      x: e.clientX,
      y: e.clientY,
      mode: "insert",
      row: null,
      rowKey: null,
      insertId,
      col,
    });
  };

  const selectedCount = selectedKeys.size;
  const stagedDeletes = pendingDeleteRows.size;
  const stagedUpdates = pendingUpdates.size;
  const stagedInserts = pendingInserts.length;
  const selectedSingleKey = selectedCount === 1 ? [...selectedKeys][0] : null;
  const selectedPendingInsert =
    selectedSingleKey != null &&
    selectedSingleKey.startsWith("ins:") &&
    pendingInserts.some((x) => `ins:${x.id}` === selectedSingleKey);
  const selectedPendingDelete = selectedSingleKey != null && pendingDeleteRows.has(selectedSingleKey);
  const selectedPendingUpdate =
    selectedSingleKey != null && pendingUpdates.has(selectedSingleKey) && !selectedPendingDelete;
  const canUnstage = selectedCount > 0 && (selectedPendingDelete || selectedPendingUpdate || selectedPendingInsert);
  const selectedStagedValues =
    selectedSingleKey != null && pendingUpdates.has(selectedSingleKey)
      ? pendingUpdates.get(selectedSingleKey)?.fieldValues ?? null
      : null;
  const selectedInsertValues =
    selectedSingleKey != null && selectedSingleKey.startsWith("ins:")
      ? pendingInserts.find((x) => `ins:${x.id}` === selectedSingleKey)?.formValues ?? null
      : null;

  useEffect(() => {
    onRecordSelectionStateChange?.({
      selectedCount,
      selectedPendingInsert,
      selectedPendingDelete,
      selectedPendingUpdate,
      canUnstage,
      selectedStagedValues,
      selectedInsertValues,
    });
  }, [
    onRecordSelectionStateChange,
    selectedCount,
    selectedPendingInsert,
    selectedPendingDelete,
    selectedPendingUpdate,
    canUnstage,
    selectedStagedValues,
    selectedInsertValues,
  ]);

  const copySelectedJson = async () => {
    if (selectedPageRow == null) return;
    logClick("table.data.copy.json", { key: selectedPageRow.key });
    try {
      await navigator.clipboard.writeText(JSON.stringify(selectedPageRow.row, null, 2));
    } catch (e) {
      notifyError(e);
    }
  };

  const copySelectedCql = async () => {
    if (selectedPageRow == null) return;
    logClick("table.data.copy.cql", { key: selectedPageRow.key });
    try {
      const names: string[] = [];
      const vals: string[] = [];
      for (const col of dataColumns) {
        names.push(quoteCqlIdent(col));
        const type = metaByName.get(col)?.type ?? "text";
        vals.push(valueToCqlLiteral(selectedPageRow.row[col], type));
      }
      const cql = `INSERT INTO ${tableRef(keyspace, table)} (${names.join(", ")}) VALUES (${vals.join(", ")})`;
      await navigator.clipboard.writeText(cql);
    } catch (e) {
      notifyError(e);
    }
  };

  const tableRows = useMemo(() => {
    const anchored = new Map<string, StagedInsert[]>();
    const unanchored: StagedInsert[] = [];
    for (const ins of pendingInserts) {
      if (ins.anchorAfterKey == null) {
        unanchored.push(ins);
      } else {
        const list = anchored.get(ins.anchorAfterKey) ?? [];
        list.push(ins);
        anchored.set(ins.anchorAfterKey, list);
      }
    }
    const out: Array<
      | { kind: "db"; row: JsonRow; key: string }
      | { kind: "insert"; insert: StagedInsert; key: string }
    > = [];
    const emittedInsertIds = new Set<string>();
    const appendAnchored = (anchorKey: string) => {
      const list = anchored.get(anchorKey);
      if (!list) return;
      for (const ins of list) {
        if (emittedInsertIds.has(ins.id)) continue;
        emittedInsertIds.add(ins.id);
        const key = `ins:${ins.id}`;
        out.push({ kind: "insert", insert: ins, key });
        appendAnchored(key);
      }
    };
    for (const r of pageRows) {
      out.push({ kind: "db", row: r.row, key: r.key });
      appendAnchored(r.key);
    }
    for (const ins of unanchored) {
      if (emittedInsertIds.has(ins.id)) continue;
      emittedInsertIds.add(ins.id);
      const key = `ins:${ins.id}`;
      out.push({ kind: "insert", insert: ins, key });
      appendAnchored(key);
    }
    if (!onlyStaged) return out;
    return out.filter((r) => {
      if (r.kind === "insert") return true;
      return pendingDeleteRows.has(r.key) || pendingUpdates.has(r.key);
    });
  }, [pageRows, pendingInserts, onlyStaged, pendingDeleteRows, pendingUpdates]);

  useEffect(() => {
    const validKeys = new Set<string>(tableRows.map((x) => x.key));
    setSelectedKeys((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const k of prev) {
        if (validKeys.has(k) || k === pendingAutoSelectKey) {
          next.add(k);
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [tableRows, pendingAutoSelectKey]);

  useEffect(() => {
    if (pendingAutoSelectKey == null) return;
    if (!tableRows.some((x) => x.key === pendingAutoSelectKey)) return;
    setSelectedKeys(new Set([pendingAutoSelectKey]));
    setPendingAutoSelectKey(null);
  }, [pendingAutoSelectKey, tableRows]);

  return (
    <div className="tableDataCrud">
      {!canCrud && !schemaLoading && (
        <p className="tableDataCrud__hint">
          {schemaError
            ? "Could not load column schema — row editing is disabled."
            : pkCols.length === 0
              ? "No primary key in schema — delete/update are unavailable."
              : null}
        </p>
      )}
      {commitMut.isError && (
        <p className="tableDataCrud__commitError" role="alert">
          {errorMessage(commitMut.error)}
        </p>
      )}
      <div className="tableResource__scroll">
        <table className="dataTable">
          <thead>
            <tr>
              {dataColumns.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableRows.map((tr) => {
              if (tr.kind === "insert") {
                const rk = tr.key;
                const insertId = tr.insert.id;
                return (
                  <tr
                    key={rk}
                    className={[
                      "tableDataCrud__tr",
                      "tableDataCrud__tr--pendingInsert",
                      selectedKeys.has(rk) && "tableDataCrud__tr--selected",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={(e) => {
                      if (!canCrud) return;
                      onRowSelect(rk, e.ctrlKey || e.metaKey);
                    }}
                  >
                    {dataColumns.map((c) => {
                      const col = metaByName.get(c);
                      if (!col) {
                        return (
                          <td key={c} className="tableDataCrud__cellPending">
                            <TableValueDisplay value={tr.insert.formValues[c] ?? null} showEmptyMarker />
                          </td>
                        );
                      }
                      const isInline = inlineEdit?.rowKey === rk && inlineEdit.colName === c;
                      return (
                        <td
                          key={c}
                          className="tableDataCrud__cellPending"
                          onDoubleClick={() => {
                            setInlineEdit({ rowKey: rk, colName: c });
                            setInlineValue(tr.insert.formValues[c] ?? null);
                          }}
                          onContextMenu={(e) => openInsertCellMenu(e, insertId, col)}
                        >
                          {isInline ? (
                            <input
                              type="text"
                              className="tableDataCrud__inlineInput"
                              autoFocus
                              value={inlineValue ?? ""}
                              onChange={(e) => setInlineValue(e.target.value)}
                              onBlur={() => commitInlineInsertEdit(insertId, col)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  commitInlineInsertEdit(insertId, col);
                                }
                                if (e.key === "Escape") {
                                  e.preventDefault();
                                  setInlineEdit(null);
                                }
                              }}
                            />
                          ) : (
                            <TableValueDisplay value={tr.insert.formValues[c] ?? null} cqlType={col.type} showEmptyMarker />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              }
              const row = tr.row;
              const rk = tr.key;
              const del = pendingDeleteRows.has(rk);
              const upd = pendingUpdates.has(rk);
              const trClass = [
                "tableDataCrud__tr",
                del && "tableDataCrud__tr--pendingDelete",
                upd && !del && "tableDataCrud__tr--pendingUpdate",
                selectedKeys.has(rk) && "tableDataCrud__tr--selected",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <tr
                  key={rk}
                  className={trClass}
                  onClick={(e) => {
                    if (!canCrud) return;
                    onRowSelect(rk, e.ctrlKey || e.metaKey);
                  }}
                >
                  {dataColumns.map((c) => {
                    const col = metaByName.get(c);
                    if (!col) {
                      return (
                        <td key={c} className={upd && !del ? "tableDataCrud__cellPending" : undefined}>
                          {displayCell(row, c, rk)}
                        </td>
                      );
                    }
                    const isInline = inlineEdit?.rowKey === rk && inlineEdit.colName === c;
                    return (
                      <td
                        key={c}
                        className={upd && !del ? "tableDataCrud__cellPending" : undefined}
                        onDoubleClick={() => startInlineEdit(row, rk, col)}
                        onContextMenu={(e) => openCellMenu(e, row, rk, col)}
                      >
                        {isInline ? (
                          <input
                            type="text"
                            className="tableDataCrud__inlineInput"
                            autoFocus
                            value={inlineValue ?? ""}
                            onChange={(e) => setInlineValue(e.target.value)}
                            onBlur={() => commitInlineEdit(row, rk, col)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                commitInlineEdit(row, rk, col);
                              }
                              if (e.key === "Escape") {
                                e.preventDefault();
                                setInlineEdit(null);
                              }
                            }}
                          />
                        ) : (
                          displayCell(row, c, rk)
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="tableDataCrud__toolbar tableDataCrud__toolbar--bottom">
        <button
          type="button"
          className="tableDataCrud__btn tableDataCrud__btn_insert"
          onClick={openInsert}
          disabled={!canCrud || commitMut.isPending}
        >
          Insert
        </button>
        <button
          type="button"
          className="tableDataCrud__btn tableDataCrud__btn_clone"
          onClick={() => {
            logClick("table.data.clone.click");
            openCloneSelected();
          }}
          disabled={
            !canCrud ||
            commitMut.isPending ||
            selectedCount !== 1 ||
            (selectedCount === 1 && pendingDeleteRows.has([...selectedKeys][0]))
          }
        >
          Clone
        </button>
        <button
          type="button"
          className="tableDataCrud__btn tableDataCrud__btn_delete"
          onClick={() => {
            logClick("table.data.delete.click");
            queueDeleteSelected();
          }}
          disabled={!canCrud || commitMut.isPending || selectedCount === 0}
        >
          Delete
        </button>
        <button
          type="button"
          className="tableDataCrud__btn"
          onClick={() => {
            logClick("table.data.unstage.click");
            unstageSelected();
          }}
          disabled={!canCrud || commitMut.isPending || selectedCount === 0}
        >
          Unstage
        </button>
        <button
          type="button"
          className="tableDataCrud__btn tableDataCrud__btn_apply"
          onClick={() => {
            logClick("table.data.commit.click");
            commitAll();
          }}
          disabled={!canCrud || !hasStagedChanges || commitMut.isPending}
        >
          {commitMut.isPending ? "Committing…" : "Commit"}
        </button>
        <button
          type="button"
          className="tableDataCrud__btn"
          onClick={() => {
            logClick("table.data.discard.click");
            discardAll();
          }}
          disabled={!hasStagedChanges || commitMut.isPending}
        >
          Discard
        </button>
        <label className="tableDataCrud__inlineToggle">
          <input
            type="checkbox"
            checked={onlyStaged}
            onChange={(e) => setOnlyStaged(e.target.checked)}
          />
          <span>Only staged</span>
        </label>
        <span className="tableDataCrud__toolbarSpacer" />
        <button
          type="button"
          className="tableDataCrud__btn"
          disabled={selectedCount !== 1 || commitMut.isPending}
          onClick={() => {
            void copySelectedCql();
          }}
        >
          Copy CQL
        </button>
        <button
          type="button"
          className="tableDataCrud__btn"
          disabled={selectedCount !== 1 || commitMut.isPending}
          onClick={() => {
            void copySelectedJson();
          }}
        >
          Copy JSON
        </button>
      </div>

      {fieldModal != null && (
        <div
          className="tableDataCrud__modalBackdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !commitMut.isPending) {
              setFieldModal(null);
            }
          }}
        >
          <div className="tableDataCrud__modal" role="dialog" aria-modal="true">
            <h3 className="tableDataCrud__modalTitle">Edit field</h3>
            <div className="tableDataCrud__fields">
              <label className="tableDataCrud__field">
                <span className="tableDataCrud__fieldLabel">
                  {fieldModal.col.name} <span className="tableDataCrud__type">({fieldModal.col.type})</span>
                </span>
                <TableFormFieldControl
                  cqlType={fieldModal.col.type}
                  value={fieldModal.value}
                  disabled={commitMut.isPending}
                  onChange={(v) => setFieldModal((prev) => (prev ? { ...prev, value: v } : prev))}
                  onSetNull={() => setFieldModal((prev) => (prev ? { ...prev, value: null } : prev))}
                  onGenerate={() => {
                    try {
                      const v = autoValueForType(fieldModal.col.type);
                      setFieldModal((prev) => (prev ? { ...prev, value: v } : prev));
                    } catch (e) {
                      notifyError(e);
                    }
                  }}
                  onNow={() => {
                    try {
                      const v = autoValueForType(fieldModal.col.type);
                      setFieldModal((prev) => (prev ? { ...prev, value: v } : prev));
                    } catch (e) {
                      notifyError(e);
                    }
                  }}
                />
              </label>
            </div>
            <div className="tableDataCrud__modalActions">
              <button
                type="button"
                className="tableDataCrud__btn"
                disabled={commitMut.isPending}
                onClick={() => setFieldModal(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="tableDataCrud__btn tableDataCrud__btn_primary"
                disabled={commitMut.isPending}
                onClick={() => {
                  try {
                    if (fieldModal.mode === "db") {
                      if (fieldModal.row == null || fieldModal.rowKey == null) {
                        throw new Error("Field editor target row is missing.");
                      }
                      stageRowField(fieldModal.row, fieldModal.rowKey, fieldModal.col, fieldModal.value);
                    } else {
                      if (fieldModal.insertId == null) {
                        throw new Error("Field editor target insert is missing.");
                      }
                      stageInsertField(fieldModal.insertId, fieldModal.col, fieldModal.value);
                    }
                    setFieldModal(null);
                  } catch (e) {
                    notifyFormFeedback(notifyError, notifyWarn, e);
                  }
                }}
              >
                Stage
              </button>
            </div>
          </div>
        </div>
      )}

      {cellMenu != null && (
        <div
          className="tableDataCrud__cellMenuBackdrop"
          onClick={() => setCellMenu(null)}
          onContextMenu={(e) => {
            e.preventDefault();
            setCellMenu(null);
          }}
        >
          <div
            className="tableDataCrud__cellMenu"
            style={{ left: cellMenu.x, top: cellMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="tableDataCrud__cellMenuItem"
              onClick={() => {
                try {
                  if (cellMenu.mode === "db") {
                    if (cellMenu.row == null || cellMenu.rowKey == null) {
                      throw new Error("Context menu row target is missing.");
                    }
                    stageRowField(cellMenu.row, cellMenu.rowKey, cellMenu.col, null);
                  } else {
                    if (cellMenu.insertId == null) {
                      throw new Error("Context menu insert target is missing.");
                    }
                    stageInsertField(cellMenu.insertId, cellMenu.col, null);
                  }
                } catch (e) {
                  notifyError(e);
                } finally {
                  setCellMenu(null);
                }
              }}
            >
              Set NULL
            </button>
            <button
              type="button"
              className="tableDataCrud__cellMenuItem"
              onClick={() => {
                try {
                  if (cellMenu.mode === "db") {
                    if (cellMenu.row == null || cellMenu.rowKey == null) {
                      throw new Error("Context menu row target is missing.");
                    }
                    const cur = currentCellFormValue(cellMenu.row, cellMenu.col, cellMenu.rowKey);
                    setFieldModal({
                      mode: "db",
                      row: cellMenu.row,
                      rowKey: cellMenu.rowKey,
                      insertId: null,
                      col: cellMenu.col,
                      value: cur,
                    });
                  } else {
                    if (cellMenu.insertId == null) {
                      throw new Error("Context menu insert target is missing.");
                    }
                    const cur = currentInsertCellFormValue(cellMenu.insertId, cellMenu.col.name);
                    setFieldModal({
                      mode: "insert",
                      row: null,
                      rowKey: null,
                      insertId: cellMenu.insertId,
                      col: cellMenu.col,
                      value: cur,
                    });
                  }
                } catch (e) {
                  notifyError(e);
                }
                setCellMenu(null);
              }}
            >
              Edit field...
            </button>
            <button
              type="button"
              className="tableDataCrud__cellMenuItem"
              onClick={() => {
                try {
                  const v = autoValueForType(cellMenu.col.type);
                  if (cellMenu.mode === "db") {
                    if (cellMenu.row == null || cellMenu.rowKey == null) {
                      throw new Error("Context menu row target is missing.");
                    }
                    stageRowField(cellMenu.row, cellMenu.rowKey, cellMenu.col, v);
                  } else {
                    if (cellMenu.insertId == null) {
                      throw new Error("Context menu insert target is missing.");
                    }
                    stageInsertField(cellMenu.insertId, cellMenu.col, v);
                  }
                } catch (e) {
                  notifyFormFeedback(notifyError, notifyWarn, e);
                } finally {
                  setCellMenu(null);
                }
              }}
            >
              Set auto
            </button>
          </div>
        </div>
      )}

      {commitConfirmOpen && (
        <div
          className="tableDataCrud__modalBackdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !commitMut.isPending) setCommitConfirmOpen(false);
          }}
        >
          <div className="tableDataCrud__modal" role="dialog" aria-modal="true">
            <h3 className="tableDataCrud__modalTitle">Commit</h3>
            <p className="tableDataCrud__hint">
              This will apply staged operations to the database:
            </p>
            <ul className="tableDataCrud__commitList">
              <li>Deletes: <strong>{stagedDeletes}</strong></li>
              <li>Updates: <strong>{stagedUpdates}</strong></li>
              <li>Inserts: <strong>{stagedInserts}</strong></li>
            </ul>
            <div className="tableDataCrud__modalActions">
              <button
                type="button"
                className="tableDataCrud__btn"
                disabled={commitMut.isPending}
                onClick={() => setCommitConfirmOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="tableDataCrud__btn tableDataCrud__btn_apply"
                disabled={commitMut.isPending}
                onClick={() => {
                  logClick("table.data.commit.confirm", { deletes: stagedDeletes, updates: stagedUpdates, inserts: stagedInserts });
                  commitMut.mutate();
                  setCommitConfirmOpen(false);
                }}
              >
                Commit
              </button>
            </div>
          </div>
        </div>
      )}

      {discardConfirmOpen && (
        <div
          className="tableDataCrud__modalBackdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !commitMut.isPending) setDiscardConfirmOpen(false);
          }}
        >
          <div className="tableDataCrud__modal" role="dialog" aria-modal="true">
            <h3 className="tableDataCrud__modalTitle">Discard</h3>
            <p className="tableDataCrud__hint">
              Discard {stagedDeletes} delete(s), {stagedUpdates} update(s), {stagedInserts} insert(s)?
            </p>
            <div className="tableDataCrud__modalActions">
              <button
                type="button"
                className="tableDataCrud__btn"
                disabled={commitMut.isPending}
                onClick={() => setDiscardConfirmOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="tableDataCrud__btn tableDataCrud__btn_delete"
                disabled={commitMut.isPending}
                onClick={() => {
                  logClick("table.data.discard.confirm", { deletes: stagedDeletes, updates: stagedUpdates, inserts: stagedInserts });
                  setPendingDeleteRows(new Map());
                  setPendingUpdates(new Map());
                  setPendingInserts([]);
                  setDiscardConfirmOpen(false);
                }}
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
