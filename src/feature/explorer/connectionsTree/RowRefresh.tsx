import { RefreshCw } from "lucide-react";
import type { RowRefreshProps } from "../../../types/feature/explorer/connectionsTree/RowRefresh.types";

export function RowRefresh({ connId, spec, refreshExplorer }: RowRefreshProps) {
  return (
    <button
      type="button"
      className="connectionsTree__rowRefresh"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        refreshExplorer(connId, spec);
      }}
      aria-label="Обновить"
      title="Обновить"
    >
      <RefreshCw className="connectionsTree__rowRefreshIcon" strokeWidth={2.25} aria-hidden />
    </button>
  );
}

export function RefreshSlot() {
  return <span className="connectionsTree__rowRefreshSlot" aria-hidden />;
}
