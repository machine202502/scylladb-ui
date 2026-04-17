import { useCallback, useEffect, useRef, useState } from "react";
import type { DataWorkspaceProps } from "../../types/feature/query/DataWorkspace.types";
import { preventMiddleRightMouseDownCapture } from "../../utils/ui/mouseButton.utils";
import { workspaceTabLabel } from "../../utils/feature/query/workspaceResource.utils";
import { CqlWorkspaceTab } from "../workspace/CqlWorkspaceTab";
import { WorkspaceResourceRouter } from "../workspace/WorkspaceResourceRouter";
import { WorkspaceTabContextMenu } from "./WorkspaceTabContextMenu";
import { readTabIndexFromPoint } from "./workspaceTabPointerReorder.utils";
import "./DataWorkspace.css";

type TabMenuState = { x: number; y: number; tabId: string; tabIndex: number };

const DRAG_THRESHOLD_PX = 6;

export function DataWorkspace({
  saved,
  liveByConnId,
  editorTabs,
  activeEditorTabId,
  onActivateEditorTab,
  onCloseEditorTab,
  onCloseOtherEditorTabs,
  onCloseEditorTabsToTheLeft,
  onCloseEditorTabsToTheRight,
  onCloseAllEditorTabs,
  reorderEditorTabs,
  activeCqlEditor,
  onActiveCqlChange,
  onRunCql,
  busy,
  cqlSessionConnected,
}: DataWorkspaceProps) {
  const activeTab = activeEditorTabId != null ? editorTabs.find((t) => t.id === activeEditorTabId) : undefined;
  const savedById = (id: number) => saved.find((c) => c.id === id);

  const [tabMenu, setTabMenu] = useState<TabMenuState | null>(null);
  const [tabDragActive, setTabDragActive] = useState(false);

  const dismissTabMenu = useCallback(() => setTabMenu(null), []);

  const reorderRef = useRef(reorderEditorTabs);
  reorderRef.current = reorderEditorTabs;
  const activateRef = useRef(onActivateEditorTab);
  activateRef.current = onActivateEditorTab;
  const tabCountRef = useRef(editorTabs.length);
  tabCountRef.current = editorTabs.length;

  useEffect(() => {
    if (tabMenu == null) return;
    if (!editorTabs.some((t) => t.id === tabMenu.tabId)) setTabMenu(null);
  }, [editorTabs, tabMenu?.tabId]);

  const onTabLabelPointerDown = useCallback(
    (e: React.PointerEvent, fromIndex: number, tabId: string) => {
      if (e.button !== 0) return;
      if (tabCountRef.current <= 1) return;

      const sx = e.clientX;
      const sy = e.clientY;
      const pointerId = e.pointerId;
      let didDrag = false;

      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > DRAG_THRESHOLD_PX) {
          didDrag = true;
          setTabDragActive(true);
        }
      };

      const onUp = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        setTabDragActive(false);

        if (!didDrag) {
          activateRef.current(tabId);
          return;
        }

        const toIndex = readTabIndexFromPoint(ev.clientX, ev.clientY);
        if (toIndex != null && toIndex !== fromIndex) {
          reorderRef.current(fromIndex, toIndex);
        }
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [],
  );

  return (
    <section className="dataWorkspace">
      <div
        className={`dataWorkspace__tabStripScroll${tabDragActive ? " dataWorkspace__tabStripScroll--dragging" : ""}`}
        role="tablist"
        aria-label="Рабочие вкладки"
        onMouseDownCapture={preventMiddleRightMouseDownCapture}
      >
        <div className="dataWorkspace__tabStrip">
          {editorTabs.map((t, i) => {
            const label = workspaceTabLabel(saved, t);
            return (
              <div
                key={t.id}
                className={`dataWorkspace__tabItem${t.id === activeEditorTabId ? " dataWorkspace__tabItem_active" : ""}`}
                data-workspace-tab-index={i}
                onAuxClick={(e) => {
                  if (e.button !== 1) return;
                  e.preventDefault();
                  onCloseEditorTab(t.id);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setTabMenu({ x: e.clientX, y: e.clientY, tabId: t.id, tabIndex: i });
                }}
              >
                <div
                  role="tab"
                  tabIndex={0}
                  className="dataWorkspace__tabBtn"
                  aria-selected={t.id === activeEditorTabId}
                  onPointerDown={(e) => onTabLabelPointerDown(e, i, t.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onActivateEditorTab(t.id);
                    }
                  }}
                >
                  {label}
                </div>
                <button
                  type="button"
                  className="dataWorkspace__tabClose"
                  aria-label={`Закрыть вкладку «${label}»`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseEditorTab(t.id);
                  }}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {tabMenu != null && (
        <WorkspaceTabContextMenu
          x={tabMenu.x}
          y={tabMenu.y}
          tabIndex={tabMenu.tabIndex}
          tabCount={editorTabs.length}
          onDismiss={dismissTabMenu}
          onClose={() => onCloseEditorTab(tabMenu.tabId)}
          onCloseOthers={() => onCloseOtherEditorTabs(tabMenu.tabId)}
          onCloseToTheLeft={() => onCloseEditorTabsToTheLeft(tabMenu.tabId)}
          onCloseToTheRight={() => onCloseEditorTabsToTheRight(tabMenu.tabId)}
          onCloseAll={onCloseAllEditorTabs}
        />
      )}

      <div className="dataWorkspace__panel">
        {activeTab?.variant === "cql" && activeCqlEditor != null && activeCqlEditor.tabId === activeTab.id && (
          <CqlWorkspaceTab
            cql={activeCqlEditor.cql}
            onCqlChange={onActiveCqlChange}
            onRun={onRunCql}
            columns={activeCqlEditor.cols}
            rows={activeCqlEditor.rows}
            busy={busy}
            connected={cqlSessionConnected}
            defaultKeyspace={activeCqlEditor.defaultKeyspace}
          />
        )}

        {activeTab?.variant === "cql" && (activeCqlEditor == null || activeCqlEditor.tabId !== activeTab.id) && (
          <p className="dataWorkspace__muted">Состояние вкладки CQL недоступно.</p>
        )}

        {activeTab?.variant === "resource" && (
          <WorkspaceResourceRouter
            payload={activeTab.payload}
            savedConn={savedById(activeTab.payload.connId)}
            live={liveByConnId[activeTab.payload.connId]}
          />
        )}
      </div>
    </section>
  );
}
