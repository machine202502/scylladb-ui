import { DataTable } from "../../ui/DataTable";

export type CqlWorkspaceTabProps = {
  cql: string;
  onCqlChange: (s: string) => void;
  onRun: () => void;
  columns: string[];
  rows: Record<string, unknown>[];
  busy: boolean;
  connected: boolean;
  defaultKeyspace: string | null;
};

export function CqlWorkspaceTab({
  cql,
  onCqlChange,
  onRun,
  columns,
  rows,
  busy,
  connected,
  defaultKeyspace,
}: CqlWorkspaceTabProps) {
  return (
    <>
      <div className="dataWorkspace__toolbar">
        <div className="dataWorkspace__toolbarLeft">
          {defaultKeyspace != null && defaultKeyspace !== "" && (
            <span className="dataWorkspace__badge" title="Контекст USE KEYSPACE для выполнения">
              USE {defaultKeyspace}
            </span>
          )}
        </div>
        <button type="button" className="dataWorkspace__run" onClick={onRun} disabled={busy || !connected}>
          {busy ? "Выполняется…" : "Выполнить"}
        </button>
      </div>
      <textarea
        className="dataWorkspace__editor"
        value={cql}
        onChange={(e) => onCqlChange(e.target.value)}
        spellCheck={false}
        disabled={!connected}
        placeholder="Введите CQL…"
      />
      <div className="dataWorkspace__scroll">
        <DataTable columns={columns} rows={rows} />
      </div>
    </>
  );
}
