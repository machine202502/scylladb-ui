import type { ConfirmModalProps } from "../types/ui/ConfirmModal.types";
import { Modal } from "./Modal";
import "./ConfirmModal.css";

export function ConfirmModal({
  open,
  title,
  titleId,
  message,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <Modal open={open} title={title} titleId={titleId} busy={busy} onClose={onCancel}>
      <div className="confirmModal__body">
        <p className="confirmModal__message">{message}</p>
        <div className="confirmModal__actions">
          <button type="button" className="confirmModal__btn confirmModal__btn_secondary" onClick={onCancel} disabled={busy}>
            Отмена
          </button>
          <button type="button" className="confirmModal__btn confirmModal__btn_danger" onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
