import { explorerPaths as P } from "../../../constants/feature/explorer/explorerFolderPaths.constants";
import type { KeyspaceBranchProps } from "../../../types/feature/explorer/connectionsTree/KeyspaceBranch.types";
import { ExplorerSchemaFolder } from "./ExplorerSchemaFolder";
import { FolderRow } from "./FolderRow";
import { KeyspaceTableRow } from "./KeyspaceTableRow";
import { explorerCaretShowsLoader, treeRowPad, treeSelectionMatches } from "../../../utils/feature/explorer/connectionsTree/tree.utils";
import { useConnectionsTreeQuery } from "./useConnectionsTreeQuery.hook";
import { RowRefresh } from "./RowRefresh";
import { TreeCaret } from "./TreeCaret";
import { TreeRowLabel } from "./TreeRowLabel";
import { useExplorerStringsQuery } from "./useExplorerStringsQuery.hook";

export function KeyspaceBranch({
  connId,
  ks,
  depth,
  treeSelection,
  toggleFolder,
  isFolderOpen,
  onSelect,
  pickTable,
  onResourceDoubleClick,
}: KeyspaceBranchProps) {
  const { refreshExplorer } = useConnectionsTreeQuery();
  const ksKey = P.ks(ks);
  const ksOpen = isFolderOpen(connId, ksKey);
  const tablesFolderOpen = isFolderOpen(connId, P.ksTables(ks));
  const wantTables = ksOpen || tablesFolderOpen;
  const tablesQ = useExplorerStringsQuery(connId, { kind: "tables", ks }, wantTables);
  const tables = tablesQ.data;
  const tablesRefresh = { kind: "tables" as const, ks };
  const ksCaretLoading = explorerCaretShowsLoader(ksOpen, tablesQ);
  const tablesCaretLoading = explorerCaretShowsLoader(tablesFolderOpen, tablesQ);

  return (
    <li className="treeNav__node">
      <div className="connectionsTree__rowHover">
        <div
          className="treeNav__row connectionsTree__treeRow"
          style={treeRowPad(depth)}
          onAuxClick={(e) => {
            if (e.button !== 1) return;
            e.preventDefault();
            toggleFolder(connId, ksKey);
          }}
        >
          <TreeCaret open={ksOpen} loading={ksCaretLoading} onClick={() => toggleFolder(connId, ksKey)} />
          <div className="connectionsTree__rowMain">
            <button
              type="button"
              className={`connectionsTree__ks treeNav__mono${treeSelectionMatches(treeSelection, connId, (s) => s.kind === "keyspace" && s.ks === ks) ? " connectionsTree__selected" : ""}`}
              onClick={() => onSelect({ connId, kind: "keyspace", ks })}
              onDoubleClick={(e) => {
                e.preventDefault();
                onResourceDoubleClick({ connId, kind: "keyspace", ks });
              }}
            >
              <TreeRowLabel kind="keyspace" entityName={ks} />
            </button>
          </div>
          <RowRefresh connId={connId} spec={tablesRefresh} refreshExplorer={refreshExplorer} />
        </div>
      </div>
      {ksOpen && tables != null && (
        <ul className="treeNav__children">
          <li className="treeNav__node">
            <FolderRow
              connId={connId}
              depth={depth + 1}
              open={tablesFolderOpen}
              caretLoading={tablesCaretLoading}
              onToggle={() => toggleFolder(connId, P.ksTables(ks))}
              rowKind="tables_folder"
              selected={treeSelectionMatches(treeSelection, connId, (s) => s.kind === "folder" && s.path === P.ksTables(ks))}
              onSelect={() => onSelect({ connId, kind: "folder", path: P.ksTables(ks) })}
              onRowDoubleClick={() => onResourceDoubleClick({ connId, kind: "folder", path: P.ksTables(ks) })}
              refreshSpec={tablesRefresh}
            />
            {tablesFolderOpen && (
              <ul className="treeNav__children">
                {tables.map((t) => (
                  <KeyspaceTableRow
                    key={P.ksTbl(ks, t)}
                    connId={connId}
                    ks={ks}
                    t={t}
                    depth={depth}
                    treeSelection={treeSelection}
                    toggleFolder={toggleFolder}
                    isFolderOpen={isFolderOpen}
                    onSelect={onSelect}
                    pickTable={pickTable}
                    onResourceDoubleClick={onResourceDoubleClick}
                  />
                ))}
              </ul>
            )}
          </li>
          <ExplorerSchemaFolder
            connId={connId}
            depth={depth + 1}
            folderPath={P.ksIdx(ks)}
            spec={{ kind: "indexes", ks }}
            folderKind="indexes_folder"
            leafKind="index"
            treeSelection={treeSelection}
            onSelect={onSelect}
            toggleFolder={toggleFolder}
            isFolderOpen={isFolderOpen}
            onResourceDoubleClick={onResourceDoubleClick}
          />
          <ExplorerSchemaFolder
            connId={connId}
            depth={depth + 1}
            folderPath={P.ksViews(ks)}
            spec={{ kind: "views", ks }}
            folderKind="mv_folder"
            leafKind="mv"
            treeSelection={treeSelection}
            onSelect={onSelect}
            toggleFolder={toggleFolder}
            isFolderOpen={isFolderOpen}
            onResourceDoubleClick={onResourceDoubleClick}
          />
          <ExplorerSchemaFolder
            connId={connId}
            depth={depth + 1}
            folderPath={P.ksTypes(ks)}
            spec={{ kind: "types", ks }}
            folderKind="udt_folder"
            leafKind="udt"
            treeSelection={treeSelection}
            onSelect={onSelect}
            toggleFolder={toggleFolder}
            isFolderOpen={isFolderOpen}
            onResourceDoubleClick={onResourceDoubleClick}
          />
          <ExplorerSchemaFolder
            connId={connId}
            depth={depth + 1}
            folderPath={P.ksFunctions(ks)}
            spec={{ kind: "functions", ks }}
            folderKind="functions_folder"
            leafKind="function"
            treeSelection={treeSelection}
            onSelect={onSelect}
            toggleFolder={toggleFolder}
            isFolderOpen={isFolderOpen}
            onResourceDoubleClick={onResourceDoubleClick}
          />
          <ExplorerSchemaFolder
            connId={connId}
            depth={depth + 1}
            folderPath={P.ksAggregates(ks)}
            spec={{ kind: "aggregates", ks }}
            folderKind="aggregates_folder"
            leafKind="aggregate"
            treeSelection={treeSelection}
            onSelect={onSelect}
            toggleFolder={toggleFolder}
            isFolderOpen={isFolderOpen}
            onResourceDoubleClick={onResourceDoubleClick}
          />
        </ul>
      )}
    </li>
  );
}
