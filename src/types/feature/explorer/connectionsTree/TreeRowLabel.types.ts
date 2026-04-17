import type { ConnectionsTreeRowKind } from "../connectionsTreeRow.types";

export type TreeRowLabelProps = {
  kind: ConnectionsTreeRowKind;
  entityName?: string;
};
