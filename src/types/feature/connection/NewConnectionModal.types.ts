import type { NewConnectionForm } from "../../scylla/scylla.types";

export type NewConnectionModalProps = {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onSubmit: (form: NewConnectionForm) => Promise<void>;
};
