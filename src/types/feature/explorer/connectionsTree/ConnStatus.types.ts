import type { ConnectionsTreeProps } from "../ConnectionsTree.types";

export type ConnStatusProps = {
  live: ConnectionsTreeProps["liveByConnId"][number] | undefined;
};
