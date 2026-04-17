import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ClusterInfo,
  ConnectionParams,
  JsonRow,
  NewConnectionForm,
  SavedConnection,
} from "../../types/scylla/scylla.types";
import type { ExplorerLoadSpec } from "../../types/feature/explorer/explorerLoad.types";
import type { ExplorerQueryFailedPayload } from "../../types/feature/explorer/explorerQueries.types";
import type { WorkspaceEditorTab } from "../../types/feature/query/workspaceResource.types";
import type { LiveSession, TreeSelection } from "../../types/feature/scylla/useScyllaWorkspace.types";
import { parseScyllaCqlInvokeResult } from "../../utils/feature/query/parseScyllaCqlResult.utils";
import {
  defaultKeyspaceForCql,
  payloadToTreeSelection,
  treeSelectionAllowsCql,
  treeSelectionToResourcePayload,
  workspaceResourceTabId,
} from "../../utils/feature/query/workspaceResource.utils";
import { normalizeConnId, normalizeSavedList } from "../../utils/connectionId";
import {
  removeAllExplorerQueries,
  removeExplorerQueriesForConnection,
} from "../../utils/feature/scylla/explorer/explorerQueries.utils";
import { paramsFromSaved } from "../../utils/paramsFromSaved";
import { useToast } from "../../ui/useToast.hook";
import { explorerSpecQueryKey } from "../../utils/feature/scylla/explorer/explorerQueryKey.utils";
import { useExplorerQueries } from "./explorer/useExplorerQueries.hook";
import { reorderTabIndices } from "../../utils/feature/query/workspaceTabReorder.utils";
import { logFront, tauriInvoke } from "../../utils/appLogger";

function emptyLiveError(): LiveSession {
  return {
    status: "error",
    cluster: null,
    userKeyspaces: [],
    treeOpen: {},
  };
}

function connectedSession(cluster: ClusterInfo, userKeyspaces: string[]): LiveSession {
  return {
    status: "connected",
    cluster,
    userKeyspaces,
    treeOpen: { root: true, keyspaces: true },
  };
}

function newCqlEditorTabId(): string {
  const c = globalThis.crypto;
  return `cql:${c?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`}`;
}

type CqlTabState = { cql: string; cols: string[]; rows: JsonRow[] };

function pickActiveAfterRemove(
  prevTabs: WorkspaceEditorTab[],
  nextTabs: WorkspaceEditorTab[],
  removedIds: Set<string>,
  previousActive: string | null,
): string | null {
  if (nextTabs.length === 0) return null;
  if (previousActive != null && !removedIds.has(previousActive)) {
    return previousActive;
  }
  if (previousActive == null) {
    return nextTabs[nextTabs.length - 1]!.id;
  }
  const oldIdx = prevTabs.findIndex((t) => t.id === previousActive);
  for (let i = oldIdx - 1; i >= 0; i--) {
    const tid = prevTabs[i]!.id;
    if (!removedIds.has(tid)) return tid;
  }
  for (let i = oldIdx + 1; i < prevTabs.length; i++) {
    const tid = prevTabs[i]!.id;
    if (!removedIds.has(tid)) return tid;
  }
  return nextTabs[0]!.id;
}

export function useScyllaWorkspace() {
  const { notifyError } = useToast();
  const qc = useQueryClient();
  const [saved, setSaved] = useState<SavedConnection[]>([]);
  const [liveByConnId, setLiveByConnId] = useState<Record<number, LiveSession>>({});
  const [treeSelection, setTreeSelectionInner] = useState<TreeSelection>(null);

  const [editorTabs, setEditorTabs] = useState<WorkspaceEditorTab[]>([]);
  const editorTabsRef = useRef(editorTabs);
  editorTabsRef.current = editorTabs;

  const [activeEditorTabId, setActiveEditorTabId] = useState<string | null>(null);
  const activeEditorTabIdRef = useRef(activeEditorTabId);
  activeEditorTabIdRef.current = activeEditorTabId;

  const [cqlStateByTabId, setCqlStateByTabId] = useState<Record<string, CqlTabState>>({});
  const cqlStateByTabIdRef = useRef(cqlStateByTabId);
  cqlStateByTabIdRef.current = cqlStateByTabId;

  const [busy, setBusy] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const setTreeSelection = useCallback((sel: TreeSelection) => {
    setTreeSelectionInner(sel);
  }, []);

  const onExplorerQueryFailed = useCallback(
    (payload: ExplorerQueryFailedPayload) => {
      void qc.removeQueries({ queryKey: payload.queryKey as readonly unknown[], exact: true });
      setLiveByConnId((prev) => {
        const s = prev[payload.connId];
        if (!s) return prev;
        const treeOpen = { ...s.treeOpen };
        for (const k of payload.folderKeys) {
          treeOpen[k] = false;
        }
        return { ...prev, [payload.connId]: { ...s, treeOpen } };
      });
    },
    [qc],
  );

  const explorerQueries = useExplorerQueries(saved, notifyError);

  const refreshExplorer = useCallback(
    (connId: number, spec: ExplorerLoadSpec) => {
      void qc.invalidateQueries({ queryKey: explorerSpecQueryKey(connId, spec) });
    },
    [qc],
  );

  const explorerTreeQuery = useMemo(
    () => ({
      ...explorerQueries,
      refreshExplorer,
      onExplorerQueryFailed,
    }),
    [explorerQueries, refreshExplorer, onExplorerQueryFailed],
  );

  const refreshSaved = useCallback(async () => {
    try {
      const list = await tauriInvoke<SavedConnection[]>("db_list_connections");
      setSaved(normalizeSavedList(list));
    } catch (e) {
      notifyError(e);
    }
  }, [notifyError]);

  useEffect(() => {
    void refreshSaved();
  }, [refreshSaved]);

  useEffect(() => {
    const ids = new Set(saved.map((s) => s.id));
    setLiveByConnId((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        const id = Number(k);
        if (!ids.has(id)) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    setTreeSelectionInner((sel) => {
      if (sel == null) return sel;
      return ids.has(sel.connId) ? sel : null;
    });
  }, [saved]);

  const toggleExplorerFolder = useCallback((connId: number, key: string) => {
    setLiveByConnId((prev) => {
      const s = prev[connId];
      if (!s || s.status !== "connected") return prev;
      const was = s.treeOpen[key] ?? false;
      return {
        ...prev,
        [connId]: { ...s, treeOpen: { ...s.treeOpen, [key]: !was } },
      };
    });
  }, []);

  const connectTo = useCallback(
    async (c: SavedConnection) => {
      logFront("info", "workspace.connection", "connect.start", "connect requested", { id: c.id, name: c.name });
      const params = paramsFromSaved(c);
      if (params.contactPoints.length === 0) {
        notifyError("В профиле нет contact points.");
        return;
      }
      setBusy(true);
      try {
        const info = await tauriInvoke<{ release_version?: string; cluster_name?: string }>("scylla_test", {
          params,
        });
        const ks = await tauriInvoke<string[]>("scylla_keyspaces", {
          params,
          includeSystem: false,
        });
        const cluster: ClusterInfo = {
          releaseVersion: info.release_version,
          clusterName: info.cluster_name,
        };
        setLiveByConnId((prev) => ({
          ...prev,
          [c.id]: connectedSession(cluster, ks),
        }));
        logFront("info", "workspace.connection", "connect.success", "connection established", { id: c.id });
      } catch (e) {
        notifyError(e);
        logFront("error", "workspace.connection", "connect.error", "connection failed", { id: c.id, error: String(e) });
        setLiveByConnId((prev) => ({
          ...prev,
          [c.id]: emptyLiveError(),
        }));
      } finally {
        setBusy(false);
      }
    },
    [notifyError],
  );

  const disconnectConn = useCallback(
    (connId: number) => {
      logFront("warn", "workspace.connection", "disconnect.one", "disconnect selected connection", { id: connId });
      removeExplorerQueriesForConnection(qc, connId);
      setLiveByConnId((prev) => {
        if (!(connId in prev)) return prev;
        const { [connId]: _, ...rest } = prev;
        return rest;
      });
    },
    [qc],
  );

  const disconnectAll = useCallback(() => {
    logFront("warn", "workspace.connection", "disconnect.all", "disconnect all connections", {});
    removeAllExplorerQueries(qc);
    setLiveByConnId({});
  }, [qc]);

  const removeEditorTabsByIds = useCallback((idsToRemove: Set<string>) => {
    if (idsToRemove.size === 0) return;
    const prevTabs = editorTabsRef.current;
    const nextTabs = prevTabs.filter((t) => !idsToRemove.has(t.id));
    if (nextTabs.length === prevTabs.length) return;
    setCqlStateByTabId((prevCql) => {
      const next = { ...prevCql };
      for (const id of idsToRemove) {
        delete next[id];
      }
      return next;
    });
    const cur = activeEditorTabIdRef.current;
    setActiveEditorTabId(pickActiveAfterRemove(prevTabs, nextTabs, idsToRemove, cur));
    setEditorTabs(nextTabs);
  }, []);

  const deleteSavedById = useCallback(
    async (id: number): Promise<boolean> => {
      logFront("warn", "workspace.connection", "delete.start", "delete saved connection", { id });
      setBusy(true);
      try {
        await tauriInvoke("db_delete_connection", { id });
        removeExplorerQueriesForConnection(qc, id);
        setLiveByConnId((prev) => {
          if (!(id in prev)) return prev;
          const { [id]: _, ...rest } = prev;
          return rest;
        });
        setTreeSelectionInner((sel) => (sel?.connId === id ? null : sel));
        const connTabIds = new Set(editorTabsRef.current.filter((t) => tConnId(t) === id).map((t) => t.id));
        removeEditorTabsByIds(connTabIds);
        await refreshSaved();
        logFront("warn", "workspace.connection", "delete.success", "deleted saved connection", { id });
        return true;
      } catch (e) {
        notifyError(e);
        logFront("error", "workspace.connection", "delete.error", "delete saved connection failed", { id, error: String(e) });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [refreshSaved, notifyError, qc, removeEditorTabsByIds],
  );

  const submitNewConnection = useCallback(
    async (form: NewConnectionForm) => {
      logFront("info", "workspace.connection", "save.start", "save new connection", { name: form.name });
      const contactPoints = form.pointsStr
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (contactPoints.length === 0) {
        throw new Error("Укажите хотя бы один хост (contact point).");
      }
      const params: ConnectionParams = {
        contactPoints,
        port: form.port,
        localDc: form.localDc,
        username: form.username,
        password: form.password,
      };
      setBusy(true);
      let pastSave = false;
      try {
        const rawId = await tauriInvoke<number>("db_save_connection", {
          input: {
            id: null,
            name: form.name.trim() || "Без имени",
            contactPoints,
            port: form.port,
            localDc: form.localDc,
            username: form.username,
            password: form.password,
          },
        });
        const id = normalizeConnId(rawId);
        if (!Number.isFinite(id)) {
          throw new Error("Некорректный id подключения.");
        }
        await refreshSaved();
        setModalOpen(false);
        pastSave = true;

        const info = await tauriInvoke<{ release_version?: string; cluster_name?: string }>("scylla_test", {
          params,
        });
        const ks = await tauriInvoke<string[]>("scylla_keyspaces", {
          params,
          includeSystem: false,
        });
        const cluster: ClusterInfo = {
          releaseVersion: info.release_version,
          clusterName: info.cluster_name,
        };
        setLiveByConnId((prev) => ({
          ...prev,
          [id]: connectedSession(cluster, ks),
        }));
        setTreeSelectionInner({ connId: id, kind: "root" });
        logFront("info", "workspace.connection", "save.success", "saved and connected new connection", { id });
      } catch (err) {
        if (!pastSave) throw err;
        notifyError(err);
        logFront("error", "workspace.connection", "save.error", "save connection failed", { error: String(err) });
      } finally {
        setBusy(false);
      }
    },
    [refreshSaved, notifyError],
  );

  const pickTable = useCallback((connId: number, ks: string, table: string) => {
    setTreeSelectionInner({ connId, kind: "table", ks, table });
  }, []);

  const openResourceTabOnDoubleClick = useCallback((sel: Exclude<TreeSelection, null>) => {
    const payload = treeSelectionToResourcePayload(sel);
    const id = workspaceResourceTabId(payload);
    setEditorTabs((prev) => {
      if (prev.some((t) => t.variant === "resource" && t.id === id)) return prev;
      return [...prev, { variant: "resource", id, payload }];
    });
    setActiveEditorTabId(id);
    setTreeSelectionInner(sel);
  }, []);

  const activateEditorTab = useCallback((id: string) => {
    setActiveEditorTabId(id);
    const tab = editorTabsRef.current.find((t) => t.id === id);
    if (tab?.variant === "resource") {
      setTreeSelectionInner(payloadToTreeSelection(tab.payload));
    }
  }, []);

  const closeEditorTab = useCallback(
    (id: string) => {
      removeEditorTabsByIds(new Set([id]));
    },
    [removeEditorTabsByIds],
  );

  const closeOtherEditorTabs = useCallback(
    (keepId: string) => {
      const toRemove = new Set(editorTabsRef.current.filter((t) => t.id !== keepId).map((t) => t.id));
      removeEditorTabsByIds(toRemove);
    },
    [removeEditorTabsByIds],
  );

  const closeEditorTabsToTheLeft = useCallback(
    (ofId: string) => {
      const tabs = editorTabsRef.current;
      const idx = tabs.findIndex((t) => t.id === ofId);
      if (idx <= 0) return;
      removeEditorTabsByIds(new Set(tabs.slice(0, idx).map((t) => t.id)));
    },
    [removeEditorTabsByIds],
  );

  const closeEditorTabsToTheRight = useCallback(
    (ofId: string) => {
      const tabs = editorTabsRef.current;
      const idx = tabs.findIndex((t) => t.id === ofId);
      if (idx < 0 || idx >= tabs.length - 1) return;
      removeEditorTabsByIds(new Set(tabs.slice(idx + 1).map((t) => t.id)));
    },
    [removeEditorTabsByIds],
  );

  const closeAllEditorTabs = useCallback(() => {
    removeEditorTabsByIds(new Set(editorTabsRef.current.map((t) => t.id)));
  }, [removeEditorTabsByIds]);

  const reorderEditorTabs = useCallback((fromIndex: number, toIndex: number) => {
    setEditorTabs((prev) => reorderTabIndices(prev, fromIndex, toIndex));
  }, []);

  const selectedConnId = treeSelection?.connId ?? null;
  const sessionForSelected = selectedConnId != null ? liveByConnId[selectedConnId] : undefined;
  const workspaceConnected = sessionForSelected?.status === "connected";

  const openCqlTab = useCallback(() => {
    if (treeSelection == null) return;
    if (!treeSelectionAllowsCql(treeSelection, workspaceConnected)) return;
    const connId = treeSelection.connId;
    const session = liveByConnId[connId];
    if (session?.status !== "connected") return;
    const c = saved.find((x) => normalizeConnId(x.id) === connId);
    if (!c) return;
    const id = newCqlEditorTabId();
    const defaultKeyspace = defaultKeyspaceForCql(treeSelection);
    setCqlStateByTabId((prev) => ({
      ...prev,
      [id]: { cql: "", cols: [], rows: [] },
    }));
    setEditorTabs((prev) => [...prev, { variant: "cql", id, connId, defaultKeyspace }]);
    setActiveEditorTabId(id);
    logFront("info", "workspace.cql", "tab.open", "opened cql tab", { connId, defaultKeyspace });
  }, [treeSelection, workspaceConnected, liveByConnId, saved]);

  const setActiveCqlText = useCallback((text: string) => {
    const id = activeEditorTabIdRef.current;
    if (id == null) return;
    const tab = editorTabsRef.current.find((t) => t.id === id);
    if (tab == null || tab.variant !== "cql") return;
    setCqlStateByTabId((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? { cols: [], rows: [] }), cql: text },
    }));
  }, []);

  const runCql = useCallback(async () => {
    const id = activeEditorTabIdRef.current;
    if (id == null) return;
    const tab = editorTabsRef.current.find((t) => t.id === id);
    if (tab == null || tab.variant !== "cql") return;
    const session = liveByConnId[tab.connId];
    if (session?.status !== "connected") return;
    const c = saved.find((x) => normalizeConnId(x.id) === tab.connId);
    if (!c) return;
    const st = cqlStateByTabIdRef.current[id];
    const text = st?.cql ?? "";
    if (!text.trim()) return;
    setBusy(true);
    logFront("info", "workspace.cql", "run.start", "run cql requested", { connId: tab.connId });
    try {
      const raw = await tauriInvoke<unknown>("scylla_run_cql", {
        params: paramsFromSaved(c),
        cql: text,
        currentKeyspace: tab.defaultKeyspace,
      });
      const parsed = parseScyllaCqlInvokeResult(raw);
      if (parsed.kind === "rows") {
        setCqlStateByTabId((prev) => ({
          ...prev,
          [id]: {
            ...(prev[id] ?? { cql: text, cols: [], rows: [] }),
            cql: text,
            cols: parsed.columns,
            rows: parsed.rows,
          },
        }));
      } else {
        setCqlStateByTabId((prev) => ({
          ...prev,
          [id]: {
            ...(prev[id] ?? { cql: text, cols: [], rows: [] }),
            cql: text,
            cols: [],
            rows: [],
          },
        }));
      }
      logFront("info", "workspace.cql", "run.success", "run cql completed", { connId: tab.connId });
    } catch (e) {
      notifyError(e);
      logFront("error", "workspace.cql", "run.error", "run cql failed", { connId: tab.connId, error: String(e) });
    } finally {
      setBusy(false);
    }
  }, [liveByConnId, saved, notifyError]);

  const openNewConnectionModal = useCallback(() => {
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    if (busy) return;
    setModalOpen(false);
  }, [busy]);

  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape" && !busy) {
        ev.preventDefault();
        setModalOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalOpen, busy]);

  const hasAnyConnected = Object.values(liveByConnId).some((s) => s.status === "connected");

  const isFolderOpen = useCallback(
    (connId: number, key: string) => liveByConnId[connId]?.treeOpen[key] ?? false,
    [liveByConnId],
  );

  const activeCqlEditor = useMemo(() => {
    if (activeEditorTabId == null) return null;
    const tab = editorTabs.find((t) => t.id === activeEditorTabId);
    if (tab == null || tab.variant !== "cql") return null;
    const st = cqlStateByTabId[tab.id] ?? { cql: "", cols: [], rows: [] };
    return {
      tabId: tab.id,
      connId: tab.connId,
      defaultKeyspace: tab.defaultKeyspace,
      cql: st.cql,
      cols: st.cols,
      rows: st.rows,
    };
  }, [activeEditorTabId, editorTabs, cqlStateByTabId]);

  const cqlSessionConnected =
    activeCqlEditor != null ? liveByConnId[activeCqlEditor.connId]?.status === "connected" : false;

  return {
    saved,
    liveByConnId,
    treeSelection,
    setTreeSelection,
    selectedConnId,
    workspaceConnected,
    cqlSessionConnected,
    hasAnyConnected,
    connectTo,
    disconnectConn,
    disconnectAll,
    deleteSavedById,
    toggleExplorerFolder,
    isFolderOpen,
    explorerTreeQuery,
    pickTable,
    editorTabs,
    activeEditorTabId,
    activateEditorTab,
    closeEditorTab,
    closeOtherEditorTabs,
    closeEditorTabsToTheLeft,
    closeEditorTabsToTheRight,
    closeAllEditorTabs,
    reorderEditorTabs,
    openResourceTabOnDoubleClick,
    openCqlTab,
    activeCqlEditor,
    setActiveCqlText,
    busy,
    modalOpen,
    openNewConnectionModal,
    closeModal,
    submitNewConnection,
    runCql,
  };
}

function tConnId(t: WorkspaceEditorTab): number {
  return t.variant === "cql" ? t.connId : t.payload.connId;
}
