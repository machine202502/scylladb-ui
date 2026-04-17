import type { JsonRow, SavedConnection } from "../../scylla/scylla.types";
import type { LiveSession } from "../scylla/useScyllaWorkspace.types";
import type { WorkspaceEditorTab } from "./workspaceResource.types";

export type DataWorkspaceProps = {
  saved: SavedConnection[];
  liveByConnId: Record<number, LiveSession>;
  editorTabs: WorkspaceEditorTab[];
  activeEditorTabId: string | null;
  onActivateEditorTab: (id: string) => void;
  onCloseEditorTab: (id: string) => void;
  onCloseOtherEditorTabs: (id: string) => void;
  onCloseEditorTabsToTheLeft: (id: string) => void;
  onCloseEditorTabsToTheRight: (id: string) => void;
  onCloseAllEditorTabs: () => void;
  reorderEditorTabs: (fromIndex: number, toIndex: number) => void;
  activeCqlEditor: {
    tabId: string;
    connId: number;
    defaultKeyspace: string | null;
    cql: string;
    cols: string[];
    rows: JsonRow[];
  } | null;
  onActiveCqlChange: (text: string) => void;
  onRunCql: () => void;
  busy: boolean;
  /** Подключение для активной CQL-вкладки (по connId вкладки). */
  cqlSessionConnected: boolean;
};
