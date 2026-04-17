import { explorerPaths as P } from "../../../constants/feature/explorer/explorerFolderPaths.constants";
import type { KeyspaceTableRowProps } from "../../../types/feature/explorer/connectionsTree/KeyspaceTableRow.types";
import { FolderRow } from "./FolderRow";
import { StringLeaves } from "./StringLeaves";
import { explorerCaretShowsLoader, treeRowPad, treeSelectionMatches } from "../../../utils/feature/explorer/connectionsTree/tree.utils";
import { useConnectionsTreeQuery } from "./useConnectionsTreeQuery.hook";
import { RowRefresh } from "./RowRefresh";
import { TreeCaret } from "./TreeCaret";
import { TreeRowLabel } from "./TreeRowLabel";
import { useExplorerStringsQuery } from "./useExplorerStringsQuery.hook";

export function KeyspaceTableRow({
  connId,
  ks,
  t,
  depth,
  treeSelection,
  toggleFolder,
  isFolderOpen,
  onSelect,
  pickTable,
  onResourceDoubleClick,
}: KeyspaceTableRowProps) {
  const { refreshExplorer } = useConnectionsTreeQuery();
  const tk = P.ksTbl(ks, t);
  const colKey = P.ksCols(ks, t);
  const idxKey = P.ksTblIdx(ks, t);
  const viewsKey = P.ksTblViews(ks, t);
  const tOpen = isFolderOpen(connId, tk);
  const colOpen = isFolderOpen(connId, colKey);
  const idxOpen = isFolderOpen(connId, idxKey);
  const viewsOpen = isFolderOpen(connId, viewsKey);
  const colsQ = useExplorerStringsQuery(connId, { kind: "columns", ks, table: t }, tOpen && colOpen);
  const idxQ = useExplorerStringsQuery(connId, { kind: "table_indexes", ks, table: t }, tOpen && idxOpen);
  const viewsQ = useExplorerStringsQuery(connId, { kind: "table_views", ks, table: t }, tOpen && viewsOpen);
  const tablesRefresh = { kind: "tables" as const, ks };

  return (
    <li className="treeNav__node">
      <div className="connectionsTree__rowHover">
        <div
          className="treeNav__row connectionsTree__treeRow"
          style={treeRowPad(depth + 2)}
          onAuxClick={(e) => {
            if (e.button !== 1) return;
            e.preventDefault();
            toggleFolder(connId, tk);
          }}
        >
          <TreeCaret open={tOpen} onClick={() => toggleFolder(connId, tk)} />
          <div className="connectionsTree__rowMain">
            <button
              type="button"
              className={`connectionsTree__tableBtn treeNav__mono${treeSelectionMatches(treeSelection, connId, (s) => s.kind === "table" && s.ks === ks && s.table === t) ? " connectionsTree__selected" : ""}`}
              onClick={() => pickTable(connId, ks, t)}
              onDoubleClick={(e) => {
                e.preventDefault();
                onResourceDoubleClick({ connId, kind: "table", ks, table: t });
              }}
            >
              <TreeRowLabel kind="table" entityName={t} />
            </button>
          </div>
          <RowRefresh connId={connId} spec={tablesRefresh} refreshExplorer={refreshExplorer} />
        </div>
      </div>
      {tOpen && (
        <ul className="treeNav__children">
          <li className="treeNav__node">
            <FolderRow
              connId={connId}
              depth={depth + 3}
              open={idxOpen}
              caretLoading={explorerCaretShowsLoader(idxOpen, idxQ)}
              onToggle={() => toggleFolder(connId, idxKey)}
              rowKind="indexes_folder"
              selected={treeSelectionMatches(treeSelection, connId, (s) => s.kind === "folder" && s.path === idxKey)}
              onSelect={() => onSelect({ connId, kind: "folder", path: idxKey })}
              onRowDoubleClick={() => onResourceDoubleClick({ connId, kind: "folder", path: idxKey })}
              refreshSpec={{ kind: "table_indexes", ks, table: t }}
            />
            {idxOpen && idxQ.data !== undefined && (
              <StringLeaves
                connId={connId}
                depth={depth + 4}
                basePath={idxKey}
                leafKind="index"
                items={idxQ.data}
                treeSelection={treeSelection}
                onSelect={onSelect}
                onLeafDoubleClick={(path) => onResourceDoubleClick({ connId, kind: "folder", path })}
                listRefreshSpec={{ kind: "table_indexes", ks, table: t }}
              />
            )}
          </li>
          <li className="treeNav__node">
            <FolderRow
              connId={connId}
              depth={depth + 3}
              open={colOpen}
              caretLoading={explorerCaretShowsLoader(colOpen, colsQ)}
              onToggle={() => toggleFolder(connId, colKey)}
              rowKind="columns_folder"
              selected={treeSelectionMatches(treeSelection, connId, (s) => s.kind === "folder" && s.path === colKey)}
              onSelect={() => onSelect({ connId, kind: "folder", path: colKey })}
              onRowDoubleClick={() => onResourceDoubleClick({ connId, kind: "folder", path: colKey })}
              refreshSpec={{ kind: "columns", ks, table: t }}
            />
            {colOpen && colsQ.data !== undefined && (
              <StringLeaves
                connId={connId}
                depth={depth + 4}
                basePath={colKey}
                leafKind="column"
                items={colsQ.data}
                treeSelection={treeSelection}
                onSelect={onSelect}
                onLeafDoubleClick={(path) => onResourceDoubleClick({ connId, kind: "folder", path })}
                listRefreshSpec={{ kind: "columns", ks, table: t }}
              />
            )}
          </li>
          <li className="treeNav__node">
            <FolderRow
              connId={connId}
              depth={depth + 3}
              open={viewsOpen}
              caretLoading={explorerCaretShowsLoader(viewsOpen, viewsQ)}
              onToggle={() => toggleFolder(connId, viewsKey)}
              rowKind="mv_folder"
              selected={treeSelectionMatches(treeSelection, connId, (s) => s.kind === "folder" && s.path === viewsKey)}
              onSelect={() => onSelect({ connId, kind: "folder", path: viewsKey })}
              onRowDoubleClick={() => onResourceDoubleClick({ connId, kind: "folder", path: viewsKey })}
              refreshSpec={{ kind: "table_views", ks, table: t }}
            />
            {viewsOpen && viewsQ.data !== undefined && (
              <StringLeaves
                connId={connId}
                depth={depth + 4}
                basePath={viewsKey}
                leafKind="mv"
                items={viewsQ.data}
                treeSelection={treeSelection}
                onSelect={onSelect}
                onLeafDoubleClick={(path) => onResourceDoubleClick({ connId, kind: "folder", path })}
                listRefreshSpec={{ kind: "table_views", ks, table: t }}
              />
            )}
          </li>
        </ul>
      )}
    </li>
  );
}
