import type { MouseEvent as ReactMouseEvent } from "react";

/** Средняя и правая кнопки: отключаем автопрокрутку, открытие ссылок и т.п. (слушать в capture). */
export function preventMiddleRightMouseDownCapture(e: ReactMouseEvent) {
  if (e.button === 1 || e.button === 2) {
    e.preventDefault();
  }
}
