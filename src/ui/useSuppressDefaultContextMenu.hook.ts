import { useEffect } from "react";

function allowNativeContextMenu(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest("textarea, input, select, [contenteditable='true']") != null;
}

/** Убирает системное меню Chromium (Назад, Обновить, Просмотреть код…) по ПКМ, кроме полей ввода. */
export function useSuppressDefaultContextMenu() {
  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      if (allowNativeContextMenu(e.target)) return;
      e.preventDefault();
    };
    document.addEventListener("contextmenu", onContextMenu, { capture: true });
    return () => document.removeEventListener("contextmenu", onContextMenu, { capture: true });
  }, []);
}
