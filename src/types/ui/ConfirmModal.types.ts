export type ConfirmModalProps = {
  open: boolean;
  title: string;
  titleId: string;
  message: string;
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};
