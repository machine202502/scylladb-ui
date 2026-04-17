import type { ExplorerLoadSpec } from "../explorerLoad.types";
import type { RefreshExplorerFn } from "../connectionsTreeInternals.types";

export type RowRefreshProps = {
  connId: number;
  spec: ExplorerLoadSpec;
  refreshExplorer: RefreshExplorerFn;
};
