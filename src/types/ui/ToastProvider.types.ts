import type { ReactNode } from "react";

export type ToastProviderProps = {
  children: ReactNode;
};

export type ToastContextValue = {
  notifyError: (err: unknown) => void;
  notifyWarn: (err: unknown) => void;
};
