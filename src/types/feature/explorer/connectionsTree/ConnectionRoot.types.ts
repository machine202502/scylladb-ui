import type { SavedConnection } from "../../../scylla/scylla.types";
import type { ConnectionsTreeProps } from "../ConnectionsTree.types";

export type ConnectionRootProps = {
  c: SavedConnection;
  live: ConnectionsTreeProps["liveByConnId"][number] | undefined;
} & Pick<
  ConnectionsTreeProps,
  | "treeSelection"
  | "onSelect"
  | "onConnect"
  | "toggleFolder"
  | "isFolderOpen"
  | "pickTable"
  | "onResourceDoubleClick"
>;
