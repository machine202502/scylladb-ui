import type { ExplorerLoadSpec } from "./explorerLoad.types";
import type { ConnectionsTreeProps } from "./ConnectionsTree.types";
import type { ConnectionsTreeRowKind } from "./connectionsTreeRow.types";
import type { TreeSelection } from "../scylla/useScyllaWorkspace.types";

export type RefreshExplorerFn = (connId: number, spec: ExplorerLoadSpec) => void;

export type TreeHandlers = Pick<
  ConnectionsTreeProps,
  "toggleFolder" | "isFolderOpen" | "onSelect" | "pickTable"
> & {
  treeSelection: TreeSelection;
};

export type FolderRowProps = {
  connId: number;
  depth: number;
  open: boolean;
  caretLoading?: boolean;
  onToggle: () => void;
  rowKind: ConnectionsTreeRowKind;
  selected: boolean;
  onSelect: () => void;
  onRowDoubleClick?: () => void;
  refreshSpec?: ExplorerLoadSpec;
};

export type LeafRowProps = {
  connId: number;
  depth: number;
  rowKind: ConnectionsTreeRowKind;
  entityName: string;
  selected: boolean;
  onSelect: () => void;
  onRowDoubleClick?: () => void;
  listRefreshSpec?: ExplorerLoadSpec;
};

export type StringLeavesProps = {
  connId: number;
  depth: number;
  basePath: string;
  leafKind: ConnectionsTreeRowKind;
  items: string[];
  treeSelection: TreeSelection;
  onSelect: ConnectionsTreeProps["onSelect"];
  onLeafDoubleClick: (path: string) => void;
  listRefreshSpec?: ExplorerLoadSpec;
};
