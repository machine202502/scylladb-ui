import type { LeafRowProps } from "../../../types/feature/explorer/connectionsTreeInternals.types";
import { treeRowPad } from "../../../utils/feature/explorer/connectionsTree/tree.utils";
import { useConnectionsTreeQuery } from "./useConnectionsTreeQuery.hook";
import { RefreshSlot, RowRefresh } from "./RowRefresh";
import { TreeRowLabel } from "./TreeRowLabel";

export function LeafRow({
  connId,
  depth,
  rowKind,
  entityName,
  selected,
  onSelect,
  onRowDoubleClick,
  listRefreshSpec,
}: LeafRowProps) {
  const { refreshExplorer } = useConnectionsTreeQuery();
  const tail =
    listRefreshSpec != null ? (
      <RowRefresh connId={connId} spec={listRefreshSpec} refreshExplorer={refreshExplorer} />
    ) : (
      <RefreshSlot />
    );
  return (
    <div className="connectionsTree__rowHover">
      <div className="treeNav__row connectionsTree__treeRow" style={treeRowPad(depth)}>
        <span className="treeNav__caretSpacer" />
        <div className="connectionsTree__rowMain">
          <button
            type="button"
            className={`connectionsTree__leafBtn treeNav__mono${selected ? " connectionsTree__selected" : ""}`}
            onClick={onSelect}
            onDoubleClick={(e) => {
              e.preventDefault();
              onRowDoubleClick?.();
            }}
          >
            <TreeRowLabel kind={rowKind} entityName={entityName} />
          </button>
        </div>
        {tail}
      </div>
    </div>
  );
}
