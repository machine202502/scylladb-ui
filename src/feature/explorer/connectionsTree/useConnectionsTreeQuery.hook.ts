import { useContext } from "react";
import type { ConnectionsTreeQueryValue } from "../../../types/feature/explorer/connectionsTreeQuery.types";
import { ConnectionsTreeQueryContext } from "./ConnectionsTreeQueryContext";

export function useConnectionsTreeQuery(): ConnectionsTreeQueryValue {
  const v = useContext(ConnectionsTreeQueryContext);
  if (v == null) {
    throw new Error("useConnectionsTreeQuery must be used inside ConnectionsTreeQueryProvider");
  }
  return v;
}
