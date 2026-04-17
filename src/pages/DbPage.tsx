import { useCallback, useState, type MouseEvent as ReactMouseEvent } from "react";
import { ConnectionsTree } from "../feature/explorer/ConnectionsTree";
import { MainToolbar } from "../feature/toolbar/MainToolbar";
import { NewConnectionModal } from "../feature/connection/NewConnectionModal";
import { DataWorkspace } from "../feature/query/DataWorkspace";
import { useScyllaWorkspace } from "../feature/scylla/useScyllaWorkspace.hook";
import {
  savedConnectionFooterParts,
  treeSelectionAllowsCql,
  treeSelectionToExplorerPath,
  workspaceTabTreePath,
} from "../utils/feature/query/workspaceResource.utils";
import { ConfirmModal } from "../ui/ConfirmModal";
import {
  MAIN_PAGE_SIDEBAR_DEFAULT_PX,
  MAIN_PAGE_SIDEBAR_MAX_PX,
  MAIN_PAGE_SIDEBAR_MIN_PX,
} from "../constants/feature/layout/mainPageLayout.constants";
import "./MainPage.css";
import type { WorkspaceEditorTab } from "../types/feature/query/workspaceResource.types";

function editorTabConnId(tab: WorkspaceEditorTab): number {
  return tab.variant === "cql" ? tab.connId : tab.payload.connId;
}

export function DbPage() {
  const ws = useScyllaWorkspace();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [sidebarPx, setSidebarPx] = useState(MAIN_PAGE_SIDEBAR_DEFAULT_PX);

  const selectedId = ws.selectedConnId;
  const liveSelected = selectedId != null ? ws.liveByConnId[selectedId] : undefined;
  const disableDisconnect = selectedId == null || liveSelected?.status !== "connected";
  const disableDisconnectAll = !ws.hasAnyConnected;
  const disableDelete = selectedId == null;

  const openDeleteConfirm = () => {
    if (selectedId == null) return;
    setDeleteTargetId(selectedId);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (deleteTargetId == null) return;
    const ok = await ws.deleteSavedById(deleteTargetId);
    if (ok) {
      setDeleteConfirmOpen(false);
      setDeleteTargetId(null);
    }
  };

  const cancelDelete = () => {
    setDeleteConfirmOpen(false);
    setDeleteTargetId(null);
  };

  const onSidebarResizeStart = useCallback(
    (e: ReactMouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = sidebarPx;
      const onMove = (ev: MouseEvent) => {
        const dx = ev.clientX - startX;
        const next = Math.min(MAIN_PAGE_SIDEBAR_MAX_PX, Math.max(MAIN_PAGE_SIDEBAR_MIN_PX, startW + dx));
        setSidebarPx(next);
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [sidebarPx],
  );

  const disableOpenCql = !treeSelectionAllowsCql(ws.treeSelection, ws.workspaceConnected);

  const activeTab =
    ws.activeEditorTabId != null ? ws.editorTabs.find((t) => t.id === ws.activeEditorTabId) : undefined;
  const footerConnId = activeTab != null ? editorTabConnId(activeTab) : selectedId;
  const footerSavedConn = footerConnId != null ? ws.saved.find((c) => c.id === footerConnId) : undefined;
  const footerConnParts =
    footerConnId != null ? savedConnectionFooterParts(footerSavedConn, footerConnId) : { name: "—", hostPort: "—" };
  const footerTreePath =
    activeTab != null
      ? workspaceTabTreePath(activeTab, ws.treeSelection)
      : ws.treeSelection != null
        ? treeSelectionToExplorerPath(ws.treeSelection)
        : "—";

  return (
    <div className="mainPage">
      <MainToolbar
        onAdd={ws.openNewConnectionModal}
        onOpenCql={ws.openCqlTab}
        disableOpenCql={disableOpenCql}
        onDisconnect={() => {
          if (selectedId != null) ws.disconnectConn(selectedId);
        }}
        onDisconnectAll={ws.disconnectAll}
        onDelete={openDeleteConfirm}
        disableDisconnect={disableDisconnect}
        disableDisconnectAll={disableDisconnectAll}
        disableDelete={disableDelete}
      />

      <div
        className="mainPage__grid"
        style={{ ["--main-sidebar-px" as string]: `${sidebarPx}px` }}
      >
        <div className="mainPage__treeScroll">
          <ConnectionsTree
            explorerTreeQuery={ws.explorerTreeQuery}
            saved={ws.saved}
            liveByConnId={ws.liveByConnId}
            treeSelection={ws.treeSelection}
            onSelect={ws.setTreeSelection}
            onConnect={ws.connectTo}
            pickTable={ws.pickTable}
            toggleFolder={ws.toggleExplorerFolder}
            isFolderOpen={ws.isFolderOpen}
            onResourceDoubleClick={ws.openResourceTabOnDoubleClick}
          />
        </div>
        <button
          type="button"
          className="mainPage__resizer"
          aria-label="Изменить ширину панели дерева"
          onMouseDown={onSidebarResizeStart}
        />
        <DataWorkspace
          saved={ws.saved}
          liveByConnId={ws.liveByConnId}
          editorTabs={ws.editorTabs}
          activeEditorTabId={ws.activeEditorTabId}
          onActivateEditorTab={ws.activateEditorTab}
          onCloseEditorTab={ws.closeEditorTab}
          onCloseOtherEditorTabs={ws.closeOtherEditorTabs}
          onCloseEditorTabsToTheLeft={ws.closeEditorTabsToTheLeft}
          onCloseEditorTabsToTheRight={ws.closeEditorTabsToTheRight}
          onCloseAllEditorTabs={ws.closeAllEditorTabs}
          reorderEditorTabs={ws.reorderEditorTabs}
          activeCqlEditor={ws.activeCqlEditor}
          onActiveCqlChange={ws.setActiveCqlText}
          onRunCql={() => void ws.runCql()}
          busy={ws.busy}
          cqlSessionConnected={ws.cqlSessionConnected}
        />
      </div>

      <footer className="mainPage__footer" aria-live="polite">
        <span className="mainPage__footerConn">
          <span className="mainPage__footerConnName">{footerConnParts.name}</span>{" "}
          <span className="mainPage__footerHostPort">{footerConnParts.hostPort}</span>
        </span>
        <span className="mainPage__footerPath">{footerTreePath}</span>
      </footer>

      <NewConnectionModal open={ws.modalOpen} busy={ws.busy} onClose={ws.closeModal} onSubmit={ws.submitNewConnection} />

      <ConfirmModal
        open={deleteConfirmOpen}
        title="Удалить подключение"
        titleId="confirm-delete-title"
        message="Удалить сохранённое подключение из списка? Активные сессии к кластеру будут закрыты."
        confirmLabel="Удалить"
        busy={ws.busy}
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />
    </div>
  );
}
