import { useEffect, useState } from "react";
import type { NewConnectionModalProps } from "../../types/feature/connection/NewConnectionModal.types";
import type { NewConnectionForm } from "../../types/scylla/scylla.types";
import { createDefaultNewConnectionForm } from "../../utils/feature/connection/newConnectionModal.utils";
import { Modal } from "../../ui/Modal";
import { useToast } from "../../ui/useToast.hook";
import "./NewConnectionModal.css";

export function NewConnectionModal({ open, busy, onClose, onSubmit }: NewConnectionModalProps) {
  const { notifyError } = useToast();
  const [form, setForm] = useState(() => createDefaultNewConnectionForm());

  useEffect(() => {
    if (open) setForm(createDefaultNewConnectionForm());
  }, [open]);

  const set = <K extends keyof NewConnectionForm>(key: K, value: NewConnectionForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  return (
    <Modal open={open} title="Новое подключение" titleId="new-conn-title" busy={busy} onClose={onClose}>
      <form
        className="newConnectionModal__form"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await onSubmit(form);
          } catch (e) {
            notifyError(e);
          }
        }}
      >
        <label className="newConnectionModal__field">
          <span className="newConnectionModal__label">Имя</span>
          <input
            className="newConnectionModal__input"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            required
          />
        </label>
        <label className="newConnectionModal__field">
          <span className="newConnectionModal__label">Contact points (через запятую)</span>
          <input
            className="newConnectionModal__input"
            value={form.pointsStr}
            onChange={(e) => set("pointsStr", e.target.value)}
            required
          />
        </label>
        <label className="newConnectionModal__field">
          <span className="newConnectionModal__label">Порт</span>
          <input
            className="newConnectionModal__input"
            type="number"
            min={1}
            max={65535}
            value={form.port}
            onChange={(e) => set("port", Number(e.target.value))}
            required
          />
        </label>
        <label className="newConnectionModal__field">
          <span className="newConnectionModal__label">Local DC</span>
          <input
            className="newConnectionModal__input"
            value={form.localDc}
            onChange={(e) => set("localDc", e.target.value)}
            required
          />
        </label>
        <label className="newConnectionModal__field">
          <span className="newConnectionModal__label">Пользователь</span>
          <input
            className="newConnectionModal__input"
            value={form.username}
            onChange={(e) => set("username", e.target.value)}
          />
        </label>
        <label className="newConnectionModal__field">
          <span className="newConnectionModal__label">Пароль</span>
          <input
            className="newConnectionModal__input"
            type="password"
            value={form.password}
            onChange={(e) => set("password", e.target.value)}
          />
        </label>
        <div className="newConnectionModal__actions">
          <button type="button" className="newConnectionModal__btnSecondary" onClick={onClose} disabled={busy}>
            Отмена
          </button>
          <button type="submit" className="newConnectionModal__submit" disabled={busy}>
            {busy ? "Подключение…" : "Подключить"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
