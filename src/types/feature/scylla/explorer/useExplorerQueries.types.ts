import type { ConnectionsTreeQueryValue } from "../../explorer/connectionsTreeQuery.types";

export type ExplorerQueriesBundle = Pick<
  ConnectionsTreeQueryValue,
  "tablesQueryFn" | "schemaStringsQueryFn" | "readExplorerStrings"
>;
