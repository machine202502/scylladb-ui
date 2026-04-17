import type { StringLeavesProps } from "../../../types/feature/explorer/connectionsTreeInternals.types";
import { treeSelectionMatches } from "../../../utils/feature/explorer/connectionsTree/tree.utils";
import { LeafRow } from "./LeafRow";

export function StringLeaves({
  connId,
  depth,
  basePath,
  leafKind,
  items,
  treeSelection,
  onSelect,
  onLeafDoubleClick,
  listRefreshSpec,
}: StringLeavesProps) {
  return (
    <ul className="treeNav__children">
      {items.map((name) => {
        const path = `${basePath}/${name}`;
        const selected = treeSelectionMatches(treeSelection, connId, (s) => s.kind === "folder" && s.path === path);
        return (
          <li key={path} className="treeNav__node">
            <LeafRow
              connId={connId}
              depth={depth}
              rowKind={leafKind}
              entityName={name}
              selected={selected}
              onSelect={() => onSelect({ connId, kind: "folder", path })}
              onRowDoubleClick={() => onLeafDoubleClick(path)}
              listRefreshSpec={listRefreshSpec}
            />
          </li>
        );
      })}
    </ul>
  );
}
