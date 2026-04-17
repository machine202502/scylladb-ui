import type { LiveSession, TreeSelection } from "../scylla/useScyllaWorkspace.types";
import type { SavedConnection } from "../../scylla/scylla.types";
import type { ConnectionsTreeQueryValue } from "./connectionsTreeQuery.types";

export type ConnectionsTreeProps = {
  explorerTreeQuery: ConnectionsTreeQueryValue;
  saved: SavedConnection[];
  liveByConnId: Record<number, LiveSession>;
  treeSelection: TreeSelection;
  onSelect: (sel: TreeSelection) => void;
  onConnect: (c: SavedConnection) => void;
  pickTable: (connId: number, ks: string, table: string) => void;
  toggleFolder: (connId: number, key: string) => void;
  isFolderOpen: (connId: number, key: string) => boolean;
  onResourceDoubleClick: (sel: Exclude<TreeSelection, null>) => void;
};
