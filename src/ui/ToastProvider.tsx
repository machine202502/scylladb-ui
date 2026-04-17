import { createContext, useCallback, useEffect, useRef, useState } from "react";
import { TOAST_MS } from "../constants/ui/ToastProvider.constants";
import type { ToastContextValue, ToastProviderProps } from "../types/ui/ToastProvider.types";
import { errorMessage } from "../utils/errorMessage";
import "./ToastProvider.css";

export const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: ToastProviderProps) {
  const [toast, setToast] = useState<{ text: string; kind: "error" | "warn" } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const dismiss = useCallback(() => {
    clearTimer();
    setToast(null);
  }, []);

  const notifyError = useCallback((err: unknown) => {
    console.error(err);
    const text = errorMessage(err);
    clearTimer();
    setToast({ text, kind: "error" });
    timerRef.current = setTimeout(dismiss, TOAST_MS);
  }, [dismiss]);

  const notifyWarn = useCallback((err: unknown) => {
    console.warn(err);
    const text = errorMessage(err);
    clearTimer();
    setToast({ text, kind: "warn" });
    timerRef.current = setTimeout(dismiss, TOAST_MS);
  }, [dismiss]);

  useEffect(() => () => clearTimer(), []);

  return (
    <ToastContext.Provider value={{ notifyError, notifyWarn }}>
      {children}
      {toast != null && (
        <div className="toastRegion" role="alert" aria-live="assertive">
          <div className={`toast${toast.kind === "warn" ? " toast_warn" : " toast_error"}`}>
            <span className="toast__text">{toast.text}</span>
            <button type="button" className="toast__close" onClick={dismiss} aria-label="Закрыть">
              ×
            </button>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}
