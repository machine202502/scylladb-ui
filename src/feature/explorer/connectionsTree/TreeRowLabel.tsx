import { TREE_ROW_LABEL_META } from "../../../constants/feature/explorer/connectionsTreeRowVisual.constants";
import type { TreeRowLabelProps } from "../../../types/feature/explorer/connectionsTree/TreeRowLabel.types";
import { getTreeRowKindIcon } from "../../../utils/feature/explorer/connectionsTree/treeRowKindIcon.utils";

export function TreeRowLabel({ kind, entityName }: TreeRowLabelProps) {
  const Icon = getTreeRowKindIcon(kind);
  const { labelUpper, showEntityName, showTypeLabel } = TREE_ROW_LABEL_META[kind];
  const showKind = showTypeLabel !== false;
  const name =
    showEntityName && entityName != null && entityName !== "" ? entityName : null;
  const [resourceName, resourceType] = name != null ? name.split("::", 2) : [null, null];
  return (
    <>
      <Icon className="connectionsTree__rowKindIcon" strokeWidth={2.25} aria-hidden />
      {showKind ? <span className="connectionsTree__rowKindLabel">{labelUpper}</span> : null}
      {name != null ? (
        <span className="connectionsTree__rowEntityName treeNav__mono">
          <span className="connectionsTree__resourceName">{resourceName ?? name}</span>
          {resourceType != null ? (
            <>
              <span className="connectionsTree__resourceSep">::</span>
              <span className="connectionsTree__resourceType">{resourceType}</span>
            </>
          ) : null}
        </span>
      ) : null}
    </>
  );
}
