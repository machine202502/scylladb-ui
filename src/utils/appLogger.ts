import { invoke } from "@tauri-apps/api/core";

export type AppLogKind = "error" | "warn" | "info";

type LogWriteInput = {
  kind: AppLogKind;
  /** Full `type` in DB, e.g. `front.scylla_tables.request`, `back.scylla_tables.response` */
  type: string;
  traceId?: string;
  name: string;
  description: string;
  meta: unknown;
};

type NoTraceCommand = "log_write" | "log_list" | "log_filter_options";

const NO_TRACE: ReadonlySet<NoTraceCommand> = new Set(["log_write", "log_list", "log_filter_options"]);

/** Rust commands take a single deserialized struct parameter named `args` (Tauri passes JSON keys by param name). */
const INVOKE_WRAPPED_ARGS: ReadonlySet<string> = new Set([
  "db_list_connections",
  "db_save_connection",
  "db_delete_connection",
  "db_get_connection",
  "scylla_test",
  "scylla_keyspaces",
  "scylla_tables",
  "scylla_preview",
  "scylla_run_cql",
  "scylla_schema_list",
]);

function normalizeMeta(meta: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(meta ?? {}));
  } catch {
    return {};
  }
}

export async function writeLog(input: LogWriteInput): Promise<void> {
  try {
    const payload: Record<string, unknown> = {
      kind: input.kind,
      type: input.type,
      name: input.name,
      description: input.description,
      meta: normalizeMeta(input.meta),
    };
    const tid = input.traceId?.trim();
    if (tid) payload.traceId = tid;

    await invoke("log_write", { input: payload });
  } catch (e) {
    console.error("[writeLog] log_write IPC failed", e);
  }
}

/** `logicalType` is without `front.` prefix; stored `type` = `front.{logicalType}` e.g. `front.scylla_tables.request`. */
export function logFront(
  kind: AppLogKind,
  logicalType: string,
  name: string,
  description: string,
  meta: unknown = {},
  traceId?: string,
): void {
  void writeLog({
    kind,
    type: `front.${logicalType}`,
    traceId,
    name,
    description,
    meta,
  }).catch((e) => {
    console.error("[logFront] writeLog failed", `front.${logicalType}`, e);
  });
}

export function logUiClick(name: string, meta: unknown = {}): void {
  logFront("info", "ui.click", name, "ui click", meta);
}

export async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const skipTrace = NO_TRACE.has(cmd as NoTraceCommand);
  const traceId = crypto.randomUUID();
  if (!skipTrace) {
    logFront("info", `${cmd}.request`, cmd, "invoke", { cmd, args: normalizeMeta(args) }, traceId);
  }

  try {
    const merged =
      skipTrace ? { ...(args ?? {}) } : { ...(args ?? {}), traceId };
    const payload = INVOKE_WRAPPED_ARGS.has(cmd) ? { args: merged } : merged;
    const res = await invoke<T>(cmd, payload);
    if (!skipTrace) {
      logFront("info", `${cmd}.response`, cmd, "ok", { cmd }, traceId);
    }
    return res;
  } catch (error) {
    if (!skipTrace) {
      logFront("error", `${cmd}.error`, cmd, "invoke failed", { cmd, error: String(error) }, traceId);
    }
    throw error;
  }
}
