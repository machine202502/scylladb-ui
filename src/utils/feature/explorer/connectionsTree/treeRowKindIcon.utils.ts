import type { LucideIcon } from "lucide-react";
import {
  Box,
  Braces,
  Columns3,
  Copy,
  Database,
  Hash,
  KeyRound,
  Layers,
  ListOrdered,
  Shield,
  Sigma,
  Table2,
  TableProperties,
  User,
  Users,
} from "lucide-react";
import type { ConnectionsTreeRowKind } from "../../../../types/feature/explorer/connectionsTreeRow.types";

const TREE_ROW_ICONS: Record<ConnectionsTreeRowKind, LucideIcon> = {
  keyspaces_folder: Layers,
  keyspace: Database,
  tables_folder: TableProperties,
  table: Table2,
  columns_folder: Columns3,
  column: Columns3,
  indexes_folder: ListOrdered,
  index: Hash,
  mv_folder: Copy,
  mv: Copy,
  udt_folder: Box,
  udt: Box,
  functions_folder: Braces,
  function: Braces,
  aggregates_folder: Sigma,
  aggregate: Sigma,
  roles_folder: Users,
  role: User,
  permissions_folder: Shield,
  permission: KeyRound,
  system_keyspace_folder: Layers,
};

export function getTreeRowKindIcon(kind: ConnectionsTreeRowKind): LucideIcon {
  return TREE_ROW_ICONS[kind];
}
