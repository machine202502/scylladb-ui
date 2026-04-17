import type { ConnectionsTreeProps } from "../../../types/feature/explorer/ConnectionsTree.types";
import { preventMiddleRightMouseDownCapture } from "../../../utils/ui/mouseButton.utils";
import { ConnectionRoot } from "./ConnectionRoot";
import { ConnectionsTreeQueryProvider } from "./ConnectionsTreeQueryContext";
import "../ConnectionsTree.css";

function ConnectionsTreeInner({
  saved,
  liveByConnId,
  treeSelection,
  onSelect,
  onConnect,
  pickTable,
  toggleFolder,
  isFolderOpen,
  onResourceDoubleClick,
}: Omit<ConnectionsTreeProps, "explorerTreeQuery">) {
  return (
    <div className="connectionsTree" onMouseDownCapture={preventMiddleRightMouseDownCapture}>
      <ul className="treeNav__list">
        {saved.map((c) => (
          <ConnectionRoot
            key={c.id}
            c={c}
            live={liveByConnId[c.id]}
            treeSelection={treeSelection}
            onSelect={onSelect}
            onConnect={onConnect}
            toggleFolder={toggleFolder}
            isFolderOpen={isFolderOpen}
            pickTable={pickTable}
            onResourceDoubleClick={onResourceDoubleClick}
          />
        ))}
      </ul>
    </div>
  );
}

export function ConnectionsTree(props: ConnectionsTreeProps) {
  const { explorerTreeQuery, ...rest } = props;
  return (
    <ConnectionsTreeQueryProvider value={explorerTreeQuery}>
      <ConnectionsTreeInner {...rest} />
    </ConnectionsTreeQueryProvider>
  );
}
