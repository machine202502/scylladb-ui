import { createContext, type ReactNode } from "react";
import type { ConnectionsTreeQueryValue } from "../../../types/feature/explorer/connectionsTreeQuery.types";

export const ConnectionsTreeQueryContext = createContext<ConnectionsTreeQueryValue | null>(null);

export function ConnectionsTreeQueryProvider({
  value,
  children,
}: {
  value: ConnectionsTreeQueryValue;
  children: ReactNode;
}) {
  return <ConnectionsTreeQueryContext.Provider value={value}>{children}</ConnectionsTreeQueryContext.Provider>;
}
