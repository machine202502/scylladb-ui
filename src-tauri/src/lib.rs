mod db;
mod scylla_api;

use db::{Db, LogFilterOptions, LogListQuery, LogListResult, LogWriteInput, SaveConnectionInput};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value as JsonValue};
use std::sync::Mutex;
use tauri::menu::{AboutMetadataBuilder, MenuBuilder, SubmenuBuilder};
use tauri::{Manager, State};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionParams {
    pub contact_points: Vec<String>,
    pub port: u16,
    pub local_dc: String,
    pub username: String,
    pub password: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedConnection {
    pub id: i64,
    pub name: String,
    pub contact_points: Vec<String>,
    pub port: u16,
    pub local_dc: String,
    pub username: String,
    pub password: String,
}

impl From<&SavedConnection> for ConnectionParams {
    fn from(s: &SavedConnection) -> Self {
        ConnectionParams {
            contact_points: s.contact_points.clone(),
            port: s.port,
            local_dc: s.local_dc.clone(),
            username: s.username.clone(),
            password: s.password.clone(),
        }
    }
}

pub struct AppState {
    pub db: Mutex<Db>,
}

fn trace_str(t: &Option<String>) -> &str {
    match t.as_deref() {
        Some(s) => {
            let x = s.trim();
            if x.is_empty() {
                ""
            } else {
                x
            }
        }
        None => "",
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DbListConnectionsArgs {
    #[serde(default)]
    trace_id: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", untagged)]
enum DbSaveConnectionArgs {
    Wrapped {
        input: SaveConnectionInput,
        #[serde(default)]
        trace_id: Option<String>,
    },
    Flat {
        #[serde(flatten)]
        input: SaveConnectionInput,
        #[serde(default)]
        trace_id: Option<String>,
    },
}

impl DbSaveConnectionArgs {
    fn input(self) -> SaveConnectionInput {
        match self {
            Self::Wrapped { input, .. } | Self::Flat { input, .. } => input,
        }
    }

    fn trace_id(&self) -> Option<&String> {
        match self {
            Self::Wrapped { trace_id, .. } | Self::Flat { trace_id, .. } => trace_id.as_ref(),
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DbDeleteConnectionArgs {
    id: i64,
    #[serde(default)]
    trace_id: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DbGetConnectionArgs {
    id: i64,
    #[serde(default)]
    trace_id: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ScyllaTestArgs {
    params: ConnectionParams,
    #[serde(default)]
    trace_id: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ScyllaKeyspacesArgs {
    params: ConnectionParams,
    include_system: bool,
    #[serde(default)]
    trace_id: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ScyllaTablesArgs {
    params: ConnectionParams,
    keyspace: String,
    #[serde(default)]
    trace_id: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ScyllaPreviewArgs {
    params: ConnectionParams,
    keyspace: String,
    table: String,
    limit: u32,
    #[serde(default)]
    offset: u32,
    #[serde(default)]
    trace_id: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ScyllaRunCqlArgs {
    params: ConnectionParams,
    cql: String,
    current_keyspace: Option<String>,
    #[serde(default)]
    trace_id: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ScyllaSchemaListArgs {
    params: ConnectionParams,
    kind: String,
    keyspace: Option<String>,
    table: Option<String>,
    #[serde(default)]
    trace_id: Option<String>,
}

const CQL_LOG_PREVIEW_ROWS: usize = 15;
const CQL_LOG_CELL_STRING_MAX_CHARS: usize = 512;
const CQL_LOG_META_MAX_BYTES: usize = 120_000;

fn truncate_log_json_strings(v: &JsonValue, max_chars: usize) -> JsonValue {
    match v {
        JsonValue::String(s) => {
            let count = s.chars().count();
            if count <= max_chars {
                return v.clone();
            }
            let mut out: String = s.chars().take(max_chars).collect();
            out.push('…');
            JsonValue::String(out)
        }
        JsonValue::Array(arr) => JsonValue::Array(
            arr.iter()
                .map(|x| truncate_log_json_strings(x, max_chars))
                .collect(),
        ),
        JsonValue::Object(map) => {
            let mut out = serde_json::Map::with_capacity(map.len());
            for (k, val) in map {
                out.insert(k.clone(), truncate_log_json_strings(val, max_chars));
            }
            JsonValue::Object(out)
        }
        _ => v.clone(),
    }
}

/// Краткое содержимое ответа `execute_cql_json` для записи в лог (без полного дампа гигантских выборок).
fn summarize_cql_result_for_log(val: &JsonValue) -> JsonValue {
    match val.get("kind").and_then(|k| k.as_str()) {
        Some("void") => json!({
            "resultKind": "void",
            "message": val.get("message"),
        }),
        Some("rows") => {
            let columns = val.get("columns").cloned().unwrap_or(json!([]));
            let col_count = val
                .get("columns")
                .and_then(|c| c.as_array())
                .map(|a| a.len())
                .unwrap_or(0);
            let rows = val.get("rows").and_then(|r| r.as_array());
            let row_count = rows.map(|a| a.len()).unwrap_or(0);
            let preview: Vec<JsonValue> = rows
                .map(|a| {
                    a.iter()
                        .take(CQL_LOG_PREVIEW_ROWS)
                        .map(|row| truncate_log_json_strings(row, CQL_LOG_CELL_STRING_MAX_CHARS))
                        .collect()
                })
                .unwrap_or_default();
            let truncated = row_count > CQL_LOG_PREVIEW_ROWS;
            json!({
                "resultKind": "rows",
                "columnCount": col_count,
                "rowCount": row_count,
                "columns": columns,
                "rowsPreview": preview,
                "truncated": truncated,
            })
        }
        _ => json!({ "resultKind": "unknown" }),
    }
}

fn cap_log_meta_size(meta: JsonValue, max_bytes: usize) -> JsonValue {
    match serde_json::to_string(&meta) {
        Ok(s) if s.len() <= max_bytes => meta,
        Ok(s) => json!({
            "note": "result summary omitted — too large for log",
            "approxBytes": s.len(),
        }),
        Err(_) => json!({ "note": "result summary serialization failed" }),
    }
}

/// Stored `type` = `back.{command}.{phase}` e.g. `back.scylla_tables.request`.
fn write_back_log(
    state: &State<'_, AppState>,
    trace_id: &str,
    kind: &str,
    command: &str,
    phase: &str,
    description: &str,
    meta: JsonValue,
) {
    let typ = format!("back.{command}.{phase}");
    let trace_id = if trace_id.is_empty() {
        None
    } else {
        Some(trace_id.to_string())
    };
    let input = LogWriteInput {
        kind: kind.to_string(),
        typ,
        trace_id,
        description: description.to_string(),
        meta,
    };
    match state.db.lock() {
        Ok(db) => {
            if let Err(e) = db.write_log(input) {
                eprintln!("[write_back_log] {command}.{phase}: {e}");
            }
        }
        Err(e) => eprintln!("[write_back_log] {command}.{phase} mutex: {e}"),
    }
}

#[tauri::command]
fn db_list_connections(
    state: State<'_, AppState>,
    args: DbListConnectionsArgs,
) -> Result<Vec<SavedConnection>, String> {
    let trace = trace_str(&args.trace_id);
    write_back_log(
        &state,
        trace,
        "info",
        "db_list_connections",
        "request",
        "SELECT connections list",
        json!({"sql":"SELECT ... FROM connections ORDER BY updated_at DESC"}),
    );
    let res = state
        .db
        .lock()
        .map_err(|e| e.to_string())?
        .list_connections()
        .map_err(|e| e.to_string());
    match &res {
        Ok(rows) => write_back_log(
            &state,
            trace,
            "info",
            "db_list_connections",
            "response",
            "connections loaded",
            json!({ "count": rows.len() }),
        ),
        Err(err) => write_back_log(
            &state,
            trace,
            "error",
            "db_list_connections",
            "error",
            "db list connections failed",
            json!({ "error": err }),
        ),
    }
    res
}

#[tauri::command]
fn db_save_connection(
    state: State<'_, AppState>,
    args: DbSaveConnectionArgs,
) -> Result<i64, String> {
    let trace_opt = args.trace_id().cloned();
    let trace = trace_str(&trace_opt);
    let input = args.input();
    write_back_log(
        &state,
        trace,
        "info",
        "db_save_connection",
        "request",
        "save connection",
        json!({ "id": input.id, "name": input.name.clone() }),
    );
    let res = state
        .db
        .lock()
        .map_err(|e| e.to_string())?
        .save_connection(input)
        .map_err(|e| e.to_string());
    match &res {
        Ok(id) => write_back_log(
            &state,
            trace,
            "info",
            "db_save_connection",
            "response",
            "connection saved",
            json!({ "id": id }),
        ),
        Err(err) => write_back_log(
            &state,
            trace,
            "error",
            "db_save_connection",
            "error",
            "save connection failed",
            json!({ "error": err }),
        ),
    }
    res
}

#[tauri::command]
fn db_delete_connection(state: State<'_, AppState>, args: DbDeleteConnectionArgs) -> Result<(), String> {
    let trace = trace_str(&args.trace_id);
    let id = args.id;
    write_back_log(
        &state,
        trace,
        "warn",
        "db_delete_connection",
        "request",
        "delete connection",
        json!({ "id": id }),
    );
    let res = state
        .db
        .lock()
        .map_err(|e| e.to_string())?
        .delete_connection(id)
        .map_err(|e| e.to_string());
    match &res {
        Ok(_) => write_back_log(
            &state,
            trace,
            "warn",
            "db_delete_connection",
            "response",
            "connection deleted",
            json!({ "id": id }),
        ),
        Err(err) => write_back_log(
            &state,
            trace,
            "error",
            "db_delete_connection",
            "error",
            "delete connection failed",
            json!({ "id": id, "error": err }),
        ),
    }
    res
}

#[tauri::command]
fn db_get_connection(
    state: State<'_, AppState>,
    args: DbGetConnectionArgs,
) -> Result<Option<SavedConnection>, String> {
    let trace = trace_str(&args.trace_id);
    let id = args.id;
    write_back_log(
        &state,
        trace,
        "info",
        "db_get_connection",
        "request",
        "get connection by id",
        json!({ "id": id }),
    );
    let res = state
        .db
        .lock()
        .map_err(|e| e.to_string())?
        .get_connection(id)
        .map_err(|e| e.to_string());
    match &res {
        Ok(row) => write_back_log(
            &state,
            trace,
            "info",
            "db_get_connection",
            "response",
            "connection loaded",
            json!({ "id": id, "found": row.is_some() }),
        ),
        Err(err) => write_back_log(
            &state,
            trace,
            "error",
            "db_get_connection",
            "error",
            "get connection failed",
            json!({ "id": id, "error": err }),
        ),
    }
    res
}

#[tauri::command]
async fn scylla_test(state: State<'_, AppState>, args: ScyllaTestArgs) -> Result<JsonValue, String> {
    let trace = trace_str(&args.trace_id);
    let params = args.params;
    write_back_log(&state, trace, "info", "scylla_test", "request", "handler entered", json!({}));
    let res = async {
        let session = scylla_api::open_session(&params).await?;
        let (rv, cn) = scylla_api::cluster_info(&session).await?;
        Ok::<JsonValue, String>(json!({
        "release_version": rv,
        "cluster_name": cn,
        }))
    }
    .await;
    match &res {
        Ok(_) => write_back_log(&state, trace, "info", "scylla_test", "response", "ok", json!({})),
        Err(err) => write_back_log(&state, trace, "error", "scylla_test", "error", "failed", json!({"error": err})),
    }
    res
}

#[tauri::command]
async fn scylla_keyspaces(state: State<'_, AppState>, args: ScyllaKeyspacesArgs) -> Result<Vec<String>, String> {
    let trace = trace_str(&args.trace_id);
    let params = args.params;
    let include_system = args.include_system;
    write_back_log(&state, trace, "info", "scylla_keyspaces", "request", "handler entered", json!({"includeSystem": include_system}));
    let res = async {
        let session = scylla_api::open_session(&params).await?;
        scylla_api::keyspaces(&session, include_system).await
    }
    .await;
    match &res {
        Ok(items) => write_back_log(&state, trace, "info", "scylla_keyspaces", "response", "ok", json!({"count": items.len()})),
        Err(err) => write_back_log(&state, trace, "error", "scylla_keyspaces", "error", "failed", json!({"error": err})),
    }
    res
}

#[tauri::command]
async fn scylla_tables(state: State<'_, AppState>, args: ScyllaTablesArgs) -> Result<Vec<String>, String> {
    let trace = trace_str(&args.trace_id);
    let params = args.params;
    let keyspace = args.keyspace;
    write_back_log(&state, trace, "info", "scylla_tables", "request", "handler entered", json!({"keyspace": keyspace.clone()}));
    let res = async {
        let session = scylla_api::open_session(&params).await?;
        scylla_api::tables(&session, &keyspace).await
    }
    .await;
    match &res {
        Ok(items) => write_back_log(&state, trace, "info", "scylla_tables", "response", "ok", json!({"count": items.len()})),
        Err(err) => write_back_log(&state, trace, "error", "scylla_tables", "error", "failed", json!({"error": err})),
    }
    res
}

#[tauri::command]
async fn scylla_preview(state: State<'_, AppState>, args: ScyllaPreviewArgs) -> Result<JsonValue, String> {
    let trace = trace_str(&args.trace_id);
    let params = args.params;
    let keyspace = args.keyspace;
    let table = args.table;
    let limit = args.limit;
    let offset = args.offset;
    write_back_log(&state, trace, "info", "scylla_preview", "request", "handler entered", json!({"keyspace": keyspace.clone(), "table": table.clone(), "limit": limit, "offset": offset}));
    let res = async {
        let session = scylla_api::open_session(&params).await?;
        let (cols, rows) = scylla_api::preview_table(&session, &keyspace, &table, limit, offset).await?;
        Ok::<JsonValue, String>(json!({ "columns": cols, "rows": rows }))
    }
    .await;
    match &res {
        Ok(val) => {
            let count = val.get("rows").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0);
            write_back_log(&state, trace, "info", "scylla_preview", "response", "ok", json!({"rows": count}));
        }
        Err(err) => write_back_log(&state, trace, "error", "scylla_preview", "error", "failed", json!({"error": err})),
    }
    res
}

#[tauri::command]
async fn scylla_run_cql(state: State<'_, AppState>, args: ScyllaRunCqlArgs) -> Result<JsonValue, String> {
    let trace = trace_str(&args.trace_id);
    let params = args.params;
    let cql = args.cql;
    let current_keyspace = args.current_keyspace;
    write_back_log(&state, trace, "info", "scylla_run_cql", "request", "execute cql", json!({"cql": cql.clone(), "currentKeyspace": current_keyspace.clone()}));
    let res = async {
        let session = scylla_api::open_session(&params).await?;
        scylla_api::execute_cql_json_with_keyspace(&session, &cql, current_keyspace.as_deref()).await
    }
    .await;
    match &res {
        Ok(val) => {
            let summary = summarize_cql_result_for_log(val);
            let meta = cap_log_meta_size(summary, CQL_LOG_META_MAX_BYTES);
            write_back_log(&state, trace, "info", "scylla_run_cql", "response", "ok", meta);
        }
        Err(err) => write_back_log(&state, trace, "error", "scylla_run_cql", "error", "failed", json!({"error": err})),
    }
    res
}

#[tauri::command]
async fn scylla_schema_list(state: State<'_, AppState>, args: ScyllaSchemaListArgs) -> Result<Vec<String>, String> {
    let trace = trace_str(&args.trace_id);
    let params = args.params;
    let kind = args.kind;
    let keyspace = args.keyspace;
    let table = args.table;
    write_back_log(&state, trace, "info", "scylla_schema_list", "request", "handler entered", json!({"kind": kind.clone(), "keyspace": keyspace.clone(), "table": table.clone()}));
    let res = async {
        let session = scylla_api::open_session(&params).await?;
        scylla_api::schema_list(
            &session,
            &kind,
            keyspace.as_deref(),
            table.as_deref(),
        )
        .await
    }
    .await;
    match &res {
        Ok(items) => write_back_log(&state, trace, "info", "scylla_schema_list", "response", "ok", json!({"count": items.len()})),
        Err(err) => write_back_log(&state, trace, "error", "scylla_schema_list", "error", "failed", json!({"error": err})),
    }
    res
}

#[tauri::command]
fn log_write(state: State<'_, AppState>, input: LogWriteInput) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.write_log(input).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn log_list(state: State<'_, AppState>, input: LogListQuery) -> Result<LogListResult, String> {
    state
        .db
        .lock()
        .map_err(|e| e.to_string())?
        .list_logs(&input)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn log_filter_options(state: State<'_, AppState>) -> Result<LogFilterOptions, String> {
    state
        .db
        .lock()
        .map_err(|e| e.to_string())?
        .log_filter_options()
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let dir = app
                .path()
                .app_local_data_dir()
                .map_err(|e| format!("app dir: {}", e))?;
            std::fs::create_dir_all(&dir).map_err(|e| format!("mkdir: {}", e))?;
            let db_path = dir.join("settings.sqlite3");
            let db = Db::open(&db_path).map_err(|e| format!("sqlite: {}", e))?;
            app.manage(AppState {
                db: Mutex::new(db),
            });

            let handle = app.handle();
            let pkg = handle.package_info();
            let config = handle.config();
            let about_meta = AboutMetadataBuilder::new()
                .name(Some(pkg.name.clone()))
                .version(Some(pkg.version.to_string()))
                .copyright(config.bundle.copyright.clone())
                .authors(config.bundle.publisher.clone().map(|p| vec![p]))
                .build();

            let settings_menu = SubmenuBuilder::new(handle, "Настройки")
                .enabled(false)
                .build()?;

            let help_menu = SubmenuBuilder::new(handle, "Справка")
                .about_with_text("О программе", Some(about_meta))
                .build()?;

            let menu = MenuBuilder::new(handle)
                .items(&[&settings_menu, &help_menu])
                .build()?;
            handle.set_menu(menu)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            db_list_connections,
            db_save_connection,
            db_delete_connection,
            db_get_connection,
            scylla_test,
            scylla_keyspaces,
            scylla_tables,
            scylla_preview,
            scylla_run_cql,
            scylla_schema_list,
            log_write,
            log_list,
            log_filter_options,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
