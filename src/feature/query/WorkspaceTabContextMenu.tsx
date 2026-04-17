import { useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import "./WorkspaceTabContextMenu.css";

export type WorkspaceTabContextMenuProps = {
  x: number;
  y: number;
  tabIndex: number;
  tabCount: number;
  onDismiss: () => void;
  onClose: () => void;
  onCloseOthers: () => void;
  onCloseToTheLeft: () => void;
  onCloseToTheRight: () => void;
  onCloseAll: () => void;
};

export function WorkspaceTabContextMenu({
  x,
  y,
  tabIndex,
  tabCount,
  onDismiss,
  onClose,
  onCloseOthers,
  onCloseToTheLeft,
  onCloseToTheRight,
  onCloseAll,
}: WorkspaceTabContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const pad = 8;
    const r = el.getBoundingClientRect();
    let left = x;
    let top = y;
    if (left + r.width > window.innerWidth - pad) left = Math.max(pad, window.innerWidth - r.width - pad);
    if (top + r.height > window.innerHeight - pad) top = Math.max(pad, window.innerHeight - r.height - pad);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, [x, y]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    const onScroll = () => onDismiss();
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [onDismiss]);

  const run = (fn: () => void) => {
    fn();
    onDismiss();
  };

  const canCloseOthers = tabCount > 1;
  const canCloseLeft = tabIndex > 0;
  const canCloseRight = tabIndex < tabCount - 1;
  const canCloseAll = tabCount > 0;

  return createPortal(
    <>
      <button
        type="button"
        className="workspaceTabMenu__backdrop"
        aria-label="Dismiss menu"
        onClick={onDismiss}
        onContextMenu={(e) => {
          e.preventDefault();
          onDismiss();
        }}
      />
      <div ref={menuRef} className="workspaceTabMenu" style={{ left: x, top: y }} role="menu" aria-label="Tab actions">
        <button type="button" className="workspaceTabMenu__item" role="menuitem" onClick={() => run(onClose)}>
          Close
        </button>
        <button
          type="button"
          className="workspaceTabMenu__item"
          role="menuitem"
          disabled={!canCloseOthers}
          onClick={() => canCloseOthers && run(onCloseOthers)}
        >
          Close others
        </button>
        <button
          type="button"
          className="workspaceTabMenu__item"
          role="menuitem"
          disabled={!canCloseLeft}
          onClick={() => canCloseLeft && run(onCloseToTheLeft)}
        >
          Close to the left
        </button>
        <button
          type="button"
          className="workspaceTabMenu__item"
          role="menuitem"
          disabled={!canCloseRight}
          onClick={() => canCloseRight && run(onCloseToTheRight)}
        >
          Close to the right
        </button>
        <hr className="workspaceTabMenu__sep" />
        <button
          type="button"
          className="workspaceTabMenu__item"
          role="menuitem"
          disabled={!canCloseAll}
          onClick={() => canCloseAll && run(onCloseAll)}
        >
          Close all
        </button>
      </div>
    </>,
    document.body,
  );
}
