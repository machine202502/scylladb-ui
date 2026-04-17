import type { ExplorerSchemaFolderProps } from "../../../types/feature/explorer/connectionsTree/ExplorerSchemaFolder.types";
import { FolderRow } from "./FolderRow";
import { StringLeaves } from "./StringLeaves";
import { explorerCaretShowsLoader, treeSelectionMatches } from "../../../utils/feature/explorer/connectionsTree/tree.utils";
import { useExplorerStringsQuery } from "./useExplorerStringsQuery.hook";

export function ExplorerSchemaFolder({
  connId,
  depth,
  folderPath,
  spec,
  folderKind,
  leafKind,
  treeSelection,
  onSelect,
  toggleFolder,
  isFolderOpen,
  onResourceDoubleClick,
}: ExplorerSchemaFolderProps) {
  const open = isFolderOpen(connId, folderPath);
  const q = useExplorerStringsQuery(connId, spec, open);
  const caretLoading = explorerCaretShowsLoader(open, q);
  return (
    <li className="treeNav__node">
      <FolderRow
        connId={connId}
        depth={depth}
        open={open}
        caretLoading={caretLoading}
        onToggle={() => toggleFolder(connId, folderPath)}
        rowKind={folderKind}
        selected={treeSelectionMatches(treeSelection, connId, (s) => s.kind === "folder" && s.path === folderPath)}
        onSelect={() => onSelect({ connId, kind: "folder", path: folderPath })}
        onRowDoubleClick={() => onResourceDoubleClick({ connId, kind: "folder", path: folderPath })}
        refreshSpec={spec}
      />
      {open && q.data !== undefined && (
        <StringLeaves
          connId={connId}
          depth={depth + 1}
          basePath={folderPath}
          leafKind={leafKind}
          items={q.data}
          treeSelection={treeSelection}
          onSelect={onSelect}
          onLeafDoubleClick={(path) => onResourceDoubleClick({ connId, kind: "folder", path })}
          listRefreshSpec={spec}
        />
      )}
    </li>
  );
}
