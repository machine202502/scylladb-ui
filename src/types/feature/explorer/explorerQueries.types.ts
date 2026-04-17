export type ExplorerQueryFailedPayload = {
  connId: number;
  queryKey: readonly unknown[];
  folderKeys: string[];
};
