import { useContext } from "react";
import type { ToastContextValue } from "../types/ui/ToastProvider.types";
import { ToastContext } from "./ToastProvider";

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (ctx == null) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}
