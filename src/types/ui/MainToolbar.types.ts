export type MainToolbarProps = {
  onAdd: () => void;
  onOpenCql: () => void;
  onDisconnect: () => void;
  onDisconnectAll: () => void;
  onDelete: () => void;
  disableOpenCql: boolean;
  disableDisconnect: boolean;
  disableDisconnectAll: boolean;
  disableDelete: boolean;
};
