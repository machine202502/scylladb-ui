import { explorerPaths as P } from "../../../constants/feature/explorer/explorerFolderPaths.constants";
import type { ConnectionRootProps } from "../../../types/feature/explorer/connectionsTree/ConnectionRoot.types";
import { ConnStatus } from "./ConnStatus";
import { ExplorerSchemaFolder } from "./ExplorerSchemaFolder";
import { FolderRow } from "./FolderRow";
import { KeyspaceBranch } from "./KeyspaceBranch";
import { explorerCaretShowsLoader, treeSelectionMatches } from "../../../utils/feature/explorer/connectionsTree/tree.utils";
import { RefreshSlot } from "./RowRefresh";
import { TreeCaret } from "./TreeCaret";
import { useExplorerStringsQuery } from "./useExplorerStringsQuery.hook";

export function ConnectionRoot({
  c,
  live,
  treeSelection,
  onSelect,
  onConnect,
  toggleFolder,
  isFolderOpen,
  pickTable,
  onResourceDoubleClick,
}: ConnectionRootProps) {
  const connId = c.id;
  const connected = live?.status === "connected";
  const rootOpen = connected && isFolderOpen(connId, P.root);
  const systemKeyspacesOpen = isFolderOpen(connId, P.sysKs);
  const systemKsQ = useExplorerStringsQuery(connId, { kind: "system_keyspaces" }, rootOpen && systemKeyspacesOpen);

  return (
    <li className="treeNav__node">
      <div className="connectionsTree__rowHover">
        <div
          className="treeNav__row connectionsTree__treeRow"
          onAuxClick={(e) => {
            if (e.button !== 1 || !connected) return;
            e.preventDefault();
            toggleFolder(connId, P.root);
          }}
        >
          <TreeCaret
            open={rootOpen}
            disabled={!connected}
            onClick={(e) => {
              e.stopPropagation();
              if (connected) toggleFolder(connId, P.root);
            }}
          />
          <ConnStatus live={live} />
          <div className="connectionsTree__rowMain">
            <button
              type="button"
              className={`connectionsTree__connLabel treeNav__mono${treeSelectionMatches(treeSelection, connId, (s) => s.kind === "root") ? " connectionsTree__selected" : ""}`}
              onClick={() => onSelect({ connId, kind: "root" })}
              onDoubleClick={(e) => {
                e.preventDefault();
                if (!live || live.status === "error") {
                  void onConnect(c);
                  return;
                }
                onResourceDoubleClick({ connId, kind: "root" });
              }}
            >
              {c.name}
            </button>
          </div>
          <RefreshSlot />
        </div>
      </div>
      {rootOpen && live?.status === "connected" && (
        <ul className="treeNav__children">
          <li className="treeNav__node">
            <FolderRow
              connId={connId}
              depth={1}
              open={isFolderOpen(connId, P.keyspaces)}
              onToggle={() => toggleFolder(connId, P.keyspaces)}
              rowKind="keyspaces_folder"
              selected={treeSelectionMatches(treeSelection, connId, (s) => s.kind === "folder" && s.path === P.keyspaces)}
              onSelect={() => onSelect({ connId, kind: "folder", path: P.keyspaces })}
              onRowDoubleClick={() => onResourceDoubleClick({ connId, kind: "folder", path: P.keyspaces })}
            />
            {isFolderOpen(connId, P.keyspaces) && (
              <ul className="treeNav__children">
                {live.userKeyspaces.map((ks) => (
                  <KeyspaceBranch
                    key={ks}
                    connId={connId}
                    ks={ks}
                    depth={2}
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
          <li className="treeNav__node">
            <FolderRow
              connId={connId}
              depth={1}
              open={systemKeyspacesOpen}
              caretLoading={explorerCaretShowsLoader(systemKeyspacesOpen, systemKsQ)}
              onToggle={() => toggleFolder(connId, P.sysKs)}
              rowKind="system_keyspace_folder"
              selected={treeSelectionMatches(treeSelection, connId, (s) => s.kind === "folder" && s.path === P.sysKs)}
              onSelect={() => onSelect({ connId, kind: "folder", path: P.sysKs })}
              onRowDoubleClick={() => onResourceDoubleClick({ connId, kind: "folder", path: P.sysKs })}
              refreshSpec={{ kind: "system_keyspaces" }}
            />
            {systemKeyspacesOpen && systemKsQ.data != null && (
              <ul className="treeNav__children">
                {systemKsQ.data.map((ks) => (
                  <KeyspaceBranch
                    key={`sys:${ks}`}
                    connId={connId}
                    ks={ks}
                    depth={2}
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
            depth={1}
            folderPath={P.roles}
            spec={{ kind: "roles" }}
            folderKind="roles_folder"
            leafKind="role"
            treeSelection={treeSelection}
            onSelect={onSelect}
            toggleFolder={toggleFolder}
            isFolderOpen={isFolderOpen}
            onResourceDoubleClick={onResourceDoubleClick}
          />
          <ExplorerSchemaFolder
            connId={connId}
            depth={1}
            folderPath={P.permissions}
            spec={{ kind: "permissions" }}
            folderKind="permissions_folder"
            leafKind="permission"
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
