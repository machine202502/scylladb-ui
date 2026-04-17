import type { FolderRowProps } from "../../../types/feature/explorer/connectionsTreeInternals.types";
import { treeRowPad } from "../../../utils/feature/explorer/connectionsTree/tree.utils";
import { useConnectionsTreeQuery } from "./useConnectionsTreeQuery.hook";
import { RefreshSlot, RowRefresh } from "./RowRefresh";
import { TreeCaret } from "./TreeCaret";
import { TreeRowLabel } from "./TreeRowLabel";

function caretLoadingForOpen(open: boolean, caretLoading?: boolean): boolean {
  return open && (caretLoading ?? false);
}

export function FolderRow({
  connId,
  depth,
  open,
  caretLoading,
  onToggle,
  rowKind,
  selected,
  onSelect,
  onRowDoubleClick,
  refreshSpec,
}: FolderRowProps) {
  const { refreshExplorer } = useConnectionsTreeQuery();
  const tail =
    refreshSpec != null ? <RowRefresh connId={connId} spec={refreshSpec} refreshExplorer={refreshExplorer} /> : <RefreshSlot />;
  return (
    <div className="connectionsTree__rowHover">
      <div
        className="treeNav__row connectionsTree__treeRow"
        style={treeRowPad(depth)}
        onAuxClick={(e) => {
          if (e.button !== 1) return;
          e.preventDefault();
          onToggle();
        }}
      >
        <TreeCaret open={open} loading={caretLoadingForOpen(open, caretLoading)} onClick={onToggle} />
        <div className="connectionsTree__rowMain">
          <button
            type="button"
            className={`connectionsTree__folderBtn treeNav__mono${selected ? " connectionsTree__selected" : ""}`}
            onClick={onSelect}
            onDoubleClick={(e) => {
              e.preventDefault();
              onRowDoubleClick?.();
            }}
          >
            <TreeRowLabel kind={rowKind} />
          </button>
        </div>
        {tail}
      </div>
    </div>
  );
}
