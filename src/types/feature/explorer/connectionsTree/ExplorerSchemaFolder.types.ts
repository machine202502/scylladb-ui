import type { ExplorerLoadSpec } from "../explorerLoad.types";
import type { ConnectionsTreeProps } from "../ConnectionsTree.types";
import type { ConnectionsTreeRowKind } from "../connectionsTreeRow.types";
import type { TreeSelection } from "../../scylla/useScyllaWorkspace.types";

export type ExplorerSchemaFolderProps = {
  connId: number;
  depth: number;
  folderPath: string;
  spec: ExplorerLoadSpec;
  folderKind: ConnectionsTreeRowKind;
  leafKind: ConnectionsTreeRowKind;
  treeSelection: TreeSelection;
  onSelect: ConnectionsTreeProps["onSelect"];
  toggleFolder: ConnectionsTreeProps["toggleFolder"];
  isFolderOpen: ConnectionsTreeProps["isFolderOpen"];
  onResourceDoubleClick: ConnectionsTreeProps["onResourceDoubleClick"];
};
