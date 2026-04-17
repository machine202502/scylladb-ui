import type { ClusterInfo } from "../../scylla/scylla.types";

export type TreeSelection =
  | null
  | { connId: number; kind: "root" }
  | { connId: number; kind: "folder"; path: string }
  | { connId: number; kind: "keyspace"; ks: string }
  | { connId: number; kind: "table"; ks: string; table: string };

export type LiveSession = {
  status: "connected" | "error";
  cluster: ClusterInfo | null;
  userKeyspaces: string[];
  treeOpen: Record<string, boolean>;
};

export type SelectedTable = {
  connId: number;
  ks: string;
  table: string;
};
