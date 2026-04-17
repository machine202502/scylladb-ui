import type { ReactNode } from "react";

export type ModalProps = {
  open: boolean;
  title: string;
  titleId: string;
  busy: boolean;
  onClose: () => void;
  children: ReactNode;
};
