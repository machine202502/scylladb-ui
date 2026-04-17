use rusqlite::{params, params_from_iter, Connection};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value as JsonValue};
use std::path::Path;
use uuid::Uuid;

use crate::SavedConnection;

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS connections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL DEFAULT '',
  contact_points_json TEXT NOT NULL,
  port INTEGER NOT NULL DEFAULT 9042,
  local_dc TEXT NOT NULL DEFAULT 'datacenter1',
  username TEXT NOT NULL DEFAULT '',
  password TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_connections_updated ON connections(updated_at DESC);
CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  meta_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  trace_id TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_logs_id_desc ON logs(id DESC);
"#;

pub struct Db(Connection);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveConnectionInput {
    pub id: Option<i64>,
    pub name: String,
    pub contact_points: Vec<String>,
    pub port: u16,
    pub local_dc: String,
    pub username: String,
    pub password: String,
}

fn default_meta_json() -> JsonValue {
    json!({})
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogWriteInput {
    pub kind: String,
    #[serde(rename = "type")]
    pub typ: String,
    pub trace_id: Option<String>,
    pub description: String,
    #[serde(default = "default_meta_json")]
    pub meta: JsonValue,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEntry {
    pub id: i64,
    pub kind: String,
    #[serde(rename = "type")]
    pub typ: String,
    pub description: String,
    pub meta: JsonValue,
    pub created_at: i64,
    pub trace_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogListResult {
    pub items: Vec<LogEntry>,
    pub next_offset: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogListFilter {
    pub id: Option<String>,
    pub kind: Option<String>,
    #[serde(rename = "type")]
    pub typ: Option<String>,
    pub trace_id: Option<String>,
    pub created_from: Option<i64>,
    pub created_to: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogFilterOptions {
    pub kinds: Vec<String>,
    pub types: Vec<String>,
}

const KIND_ENUM: &[&str] = &["error", "warn", "info"];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogListSort {
    pub field: String,
    pub dir: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogListQuery {
    pub offset: u32,
    pub limit: u32,
    pub filter: LogListFilter,
    pub sort: LogListSort,
}

fn sort_sql_order(field: &str, dir: &str) -> String {
    let col = match field {
        "id" => "id",
        "kind" => "kind",
        "type" => "\"type\"",
        "trace_id" | "traceId" => "trace_id",
        "created_at" | "createdAt" => "created_at",
        _ => "id",
    };
    let d = if dir.eq_ignore_ascii_case("asc") {
        "ASC"
    } else {
        "DESC"
    };
    format!("{col} {d}")
}

fn merge_enum_with_distinct(const_enum: &[&str], from_db: Vec<String>) -> Vec<String> {
    let mut out: Vec<String> = const_enum.iter().map(|s| (*s).to_string()).collect();
    for s in from_db {
        if !out.contains(&s) {
            out.push(s);
        }
    }
    out
}

impl Db {
    pub fn open(path: &Path) -> Result<Self, rusqlite::Error> {
        let conn = Connection::open(path)?;
        conn.execute_batch(SCHEMA)?;
        Ok(Db(conn))
    }

    pub fn list_connections(&self) -> Result<Vec<SavedConnection>, rusqlite::Error> {
        let mut stmt = self.0.prepare(
            "SELECT id, name, contact_points_json, port, local_dc, username, password \
             FROM connections ORDER BY updated_at DESC",
        )?;
        let mapped = stmt.query_map([], |r| {
            let cp: String = r.get(2)?;
            let contact_points: Vec<String> = serde_json::from_str(&cp).unwrap_or_default();
            Ok(SavedConnection {
                id: r.get(0)?,
                name: r.get(1)?,
                contact_points,
                port: r.get::<_, i64>(3)? as u16,
                local_dc: r.get(4)?,
                username: r.get(5)?,
                password: r.get(6)?,
            })
        })?;
        mapped.collect()
    }

    pub fn save_connection(&self, input: SaveConnectionInput) -> Result<i64, rusqlite::Error> {
        let json = serde_json::to_string(&input.contact_points).unwrap_or_else(|_| "[]".into());
        match input.id {
            Some(id) => {
                self.0.execute(
                    "UPDATE connections SET name = ?1, contact_points_json = ?2, port = ?3, \
                     local_dc = ?4, username = ?5, password = ?6, updated_at = datetime('now') \
                     WHERE id = ?7",
                    params![
                        input.name,
                        json,
                        input.port as i64,
                        input.local_dc,
                        input.username,
                        input.password,
                        id
                    ],
                )?;
                Ok(id)
            }
            None => {
                self.0.execute(
                    "INSERT INTO connections (name, contact_points_json, port, local_dc, username, password) \
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                    params![
                        input.name,
                        json,
                        input.port as i64,
                        input.local_dc,
                        input.username,
                        input.password,
                    ],
                )?;
                Ok(self.0.last_insert_rowid())
            }
        }
    }

    pub fn delete_connection(&self, id: i64) -> Result<(), rusqlite::Error> {
        self.0
            .execute("DELETE FROM connections WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn get_connection(&self, id: i64) -> Result<Option<SavedConnection>, rusqlite::Error> {
        let mut stmt = self.0.prepare(
            "SELECT id, name, contact_points_json, port, local_dc, username, password \
             FROM connections WHERE id = ?1",
        )?;
        let mut rows = stmt.query_map(params![id], |r| {
            let cp: String = r.get(2)?;
            let contact_points: Vec<String> = serde_json::from_str(&cp).unwrap_or_default();
            Ok(SavedConnection {
                id: r.get(0)?,
                name: r.get(1)?,
                contact_points,
                port: r.get::<_, i64>(3)? as u16,
                local_dc: r.get(4)?,
                username: r.get(5)?,
                password: r.get(6)?,
            })
        })?;
        Ok(rows.next().transpose()?)
    }

    pub fn log_filter_options(&self) -> Result<LogFilterOptions, rusqlite::Error> {
        let kinds_db = self.distinct_simple_column("kind")?;
        let types_db = self.distinct_type_column()?;

        Ok(LogFilterOptions {
            kinds: merge_enum_with_distinct(KIND_ENUM, kinds_db),
            types: types_db,
        })
    }

    fn distinct_simple_column(&self, col: &str) -> Result<Vec<String>, rusqlite::Error> {
        let sql = format!("SELECT DISTINCT {col} FROM logs ORDER BY {col} ASC");
        let mut stmt = self.0.prepare(&sql)?;
        let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
        rows.collect()
    }

    fn distinct_type_column(&self) -> Result<Vec<String>, rusqlite::Error> {
        let mut stmt = self
            .0
            .prepare(r#"SELECT DISTINCT "type" FROM logs ORDER BY "type" ASC"#)?;
        let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
        rows.collect()
    }

    pub fn write_log(&self, input: LogWriteInput) -> Result<i64, rusqlite::Error> {
        let meta_json = serde_json::to_string(&input.meta).unwrap_or_else(|_| "{}".to_string());
        // Only generate a trace id when the client did not send one (backend-only / legacy calls).
        // If `traceId` is present and non-empty from the frontend, it must be stored as-is.
        let trace = match input.trace_id {
            None => Uuid::new_v4().to_string(),
            Some(ref s) => {
                let t = s.trim();
                if t.is_empty() {
                    String::new()
                } else {
                    t.to_string()
                }
            }
        };
        self.0.execute(
            "INSERT INTO logs (kind, \"type\", description, meta_json, trace_id, created_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, unixepoch())",
            params![input.kind, input.typ, input.description, meta_json, trace],
        )?;
        Ok(self.0.last_insert_rowid())
    }

    pub fn list_logs(&self, query: &LogListQuery) -> Result<LogListResult, rusqlite::Error> {
        let limit = query.limit.clamp(1, 200) as i64;
        let offset = query.offset as i64;

        let mut sql = String::from(
            "SELECT id, kind, \"type\", description, meta_json, \
             COALESCE(CAST(created_at AS INTEGER), 0), COALESCE(trace_id, '') FROM logs WHERE 1=1",
        );
        let mut binds: Vec<rusqlite::types::Value> = Vec::new();

        let f = &query.filter;
        if let Some(ref s) = f.id {
            if !s.trim().is_empty() {
                sql.push_str(" AND CAST(id AS TEXT) LIKE ? ESCAPE '\\'");
                let id_pattern = format!(
                    "%{}%",
                    s.trim()
                        .replace('\\', "\\\\")
                        .replace('%', "\\%")
                        .replace('_', "\\_")
                );
                binds.push(id_pattern.into());
            }
        }
        if let Some(ref s) = f.kind {
            if !s.trim().is_empty() {
                sql.push_str(" AND kind = ?");
                binds.push(s.trim().to_string().into());
            }
        }
        if let Some(ref s) = f.typ {
            if !s.trim().is_empty() {
                sql.push_str(" AND \"type\" = ?");
                binds.push(s.trim().to_string().into());
            }
        }
        if let Some(ref s) = f.trace_id {
            if !s.trim().is_empty() {
                sql.push_str(" AND trace_id LIKE ? ESCAPE '\\'");
                let pat = format!(
                    "%{}%",
                    s.trim()
                        .replace('\\', "\\\\")
                        .replace('%', "\\%")
                        .replace('_', "\\_")
                );
                binds.push(pat.into());
            }
        }
        if let Some(s) = f.created_from {
            if s > 0 {
                sql.push_str(" AND COALESCE(CAST(created_at AS INTEGER), 0) >= ?");
                binds.push(s.into());
            }
        }
        if let Some(s) = f.created_to {
            if s > 0 {
                sql.push_str(" AND COALESCE(CAST(created_at AS INTEGER), 0) <= ?");
                binds.push(s.into());
            }
        }

        sql.push_str(" ORDER BY ");
        sql.push_str(&sort_sql_order(&query.sort.field, &query.sort.dir));
        sql.push_str(" LIMIT ? OFFSET ?");
        binds.push(limit.into());
        binds.push(offset.into());

        let mut stmt = self.0.prepare(&sql)?;
        let mapped = stmt.query_map(params_from_iter(binds), |r| {
            let meta_raw: String = r.get(4)?;
            let meta = serde_json::from_str::<JsonValue>(&meta_raw).unwrap_or_else(|_| json!({}));
            Ok(LogEntry {
                id: r.get(0)?,
                kind: r.get(1)?,
                typ: r.get(2)?,
                description: r.get(3)?,
                meta,
                created_at: r.get(5)?,
                trace_id: r.get(6)?,
            })
        })?;

        let items: Vec<LogEntry> = mapped.collect::<Result<Vec<_>, _>>()?;
        let next_offset = if items.len() as i64 == limit {
            Some(query.offset.saturating_add(items.len() as u32))
        } else {
            None
        };

        Ok(LogListResult { items, next_offset })
    }
}
