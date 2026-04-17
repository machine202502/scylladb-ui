import type { ModalProps } from "../types/ui/Modal.types";
import "./Modal.css";

export function Modal({ open, title, titleId, busy, onClose, children }: ModalProps) {
  if (!open) return null;

  return (
    <div
      className="modal__backdrop"
      role="presentation"
      onMouseDown={(ev) => {
        if (ev.target === ev.currentTarget && !busy) onClose();
      }}
    >
      <div className="modal__dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="modal__head">
          <h2 id={titleId} className="modal__title">
            {title}
          </h2>
          <button type="button" className="modal__close" onClick={onClose} disabled={busy} aria-label="Закрыть">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
