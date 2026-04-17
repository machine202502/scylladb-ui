import type { ConnectionsTreeProps } from "../ConnectionsTree.types";
import type { TreeSelection } from "../../scylla/useScyllaWorkspace.types";

export type KeyspaceTableRowProps = {
  connId: number;
  ks: string;
  t: string;
  depth: number;
  treeSelection: TreeSelection;
} & Pick<
  ConnectionsTreeProps,
  "toggleFolder" | "isFolderOpen" | "onSelect" | "pickTable" | "onResourceDoubleClick"
>;
