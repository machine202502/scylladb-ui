import "./CenterSpinner.css";

export function CenterSpinner() {
  return (
    <div className="workspaceSpinner">
      <div className="workspaceSpinner__dot" aria-hidden />
      <p className="workspaceSpinner__text">Загрузка…</p>
    </div>
  );
}
