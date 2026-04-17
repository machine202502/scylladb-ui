use scylla::client::execution_profile::ExecutionProfile;
use scylla::client::session::Session;
use scylla::client::session_builder::SessionBuilder;
use scylla::response::query_result::{IntoRowsResultError, QueryResult};
use scylla::statement::Consistency;
use scylla::value::{CqlValue, Row};
use serde_json::{json, Value as JsonValue};

use crate::ConnectionParams;

pub async fn open_session(p: &ConnectionParams) -> Result<Session, String> {
    if p.contact_points.is_empty() {
        return Err("No contact points".into());
    }
    let mut b = SessionBuilder::new();
    for host in &p.contact_points {
        let addr = format!("{}:{}", host.trim(), p.port);
        b = b.known_node(addr);
    }
    let b = if !p.username.is_empty() || !p.password.is_empty() {
        b.user(&p.username, &p.password)
    } else {
        b
    };
    // Driver default is LOCAL_QUORUM; single-node / RF=1 clusters need a one-replica CL (e.g. LocalOne).
    let profile = ExecutionProfile::builder()
        .consistency(Consistency::LocalOne)
        .build();
    let b = b.default_execution_profile_handle(profile.into_handle());
    b.build().await.map_err(|e| e.to_string())
}

pub async fn cluster_info(session: &Session) -> Result<(Option<String>, Option<String>), String> {
    let rs = session
        .query_unpaged("SELECT release_version, cluster_name FROM system.local", &[])
        .await
        .map_err(|e| e.to_string())?;
    let rows = rs
        .into_rows_result()
        .map_err(|e| e.to_string())?
        .maybe_first_row::<(Option<String>, Option<String>)>()
        .map_err(|e| e.to_string())?;
    Ok(rows.unwrap_or((None, None)))
}

fn cql_value_to_json(v: &CqlValue) -> JsonValue {
    match v {
        CqlValue::Ascii(s) | CqlValue::Text(s) => json!(s),
        CqlValue::Boolean(b) => json!(b),
        CqlValue::Int(i) => json!(i),
        CqlValue::SmallInt(i) => json!(i),
        CqlValue::TinyInt(i) => json!(i),
        CqlValue::BigInt(i) => json!(i.to_string()),
        CqlValue::Counter(c) => json!(c.0.to_string()),
        CqlValue::Float(f) => json!(f),
        CqlValue::Double(d) => json!(d),
        CqlValue::Blob(b) => json!(format!("0x{}", hex::encode(b))),
        CqlValue::Inet(i) => json!(i.to_string()),
        CqlValue::Uuid(u) => json!(u.to_string()),
        CqlValue::Timeuuid(t) => json!(t.to_string()),
        CqlValue::Timestamp(ts) => json!(ts.0.to_string()),
        CqlValue::Time(t) => json!(format!("{:?}", t)),
        CqlValue::Date(d) => json!(d.0),
        CqlValue::Duration(d) => json!(format!("{:?}", d)),
        CqlValue::Varint(v) => json!(format!("{:?}", v)),
        CqlValue::Decimal(d) => json!(format!("{:?}", d)),
        CqlValue::List(l) => JsonValue::Array(l.iter().map(cql_value_to_json).collect()),
        CqlValue::Set(s) => JsonValue::Array(s.iter().map(cql_value_to_json).collect()),
        CqlValue::Map(m) => {
            let mut obj = serde_json::Map::new();
            for (k, v) in m {
                obj.insert(format!("{}", k), cql_value_to_json(v));
            }
            JsonValue::Object(obj)
        }
        CqlValue::UserDefinedType { keyspace, name, fields } => {
            let mut fm = serde_json::Map::new();
            for (n, ov) in fields {
                fm.insert(
                    n.clone(),
                    ov.as_ref().map_or(JsonValue::Null, cql_value_to_json),
                );
            }
            json!({
                "udt": format!("{}.{}", keyspace, name),
                "fields": fm,
            })
        }
        CqlValue::Tuple(t) => JsonValue::Array(t.iter().map(|x| x.as_ref().map_or(JsonValue::Null, cql_value_to_json)).collect()),
        CqlValue::Vector(v) => JsonValue::Array(v.iter().map(cql_value_to_json).collect()),
        CqlValue::Empty => JsonValue::Null,
        _ => json!(format!("{:?}", v)),
    }
}

fn trim_cql(cql: &str) -> Result<&str, String> {
    let t = cql.trim().trim_end_matches(';').trim();
    if t.is_empty() {
        return Err("Empty CQL".into());
    }
    Ok(t)
}

fn rows_from_query_result(qr: QueryResult) -> Result<(Vec<String>, Vec<JsonValue>), String> {
    let rows_res = qr.into_rows_result().map_err(|e| match e {
        IntoRowsResultError::ResultNotRows(_) => {
            "Internal error: expected row result".to_string()
        }
        _ => format!("{e:?}"),
    })?;
    let cols: Vec<String> = rows_res
        .column_specs()
        .iter()
        .map(|s| s.name().to_string())
        .collect();
    let mut rows_iter = rows_res.rows::<Row>().map_err(|e| format!("{e:?}"))?;
    let mut out_rows = Vec::new();
    while let Some(row_res) = rows_iter.next() {
        let row = row_res.map_err(|e| format!("{e:?}"))?;
        let obj: serde_json::Map<String, JsonValue> = cols
            .iter()
            .zip(row.columns.iter())
            .map(|(name, cell)| {
                let v = match cell {
                    None => JsonValue::Null,
                    Some(cv) => cql_value_to_json(cv),
                };
                (name.clone(), v)
            })
            .collect();
        out_rows.push(JsonValue::Object(obj));
    }
    Ok((cols, out_rows))
}

pub async fn query_to_json(session: &Session, cql: &str) -> Result<(Vec<String>, Vec<JsonValue>), String> {
    let to_run = trim_cql(cql)?;
    let qr = session
        .query_unpaged(to_run, &[])
        .await
        .map_err(|e| e.to_string())?;
    rows_from_query_result(qr)
}

pub async fn execute_cql_json(session: &Session, cql: &str) -> Result<JsonValue, String> {
    let to_run = trim_cql(cql)?;
    let qr = session
        .query_unpaged(to_run, &[])
        .await
        .map_err(|e| e.to_string())?;
    match qr.into_rows_result() {
        Ok(rows_res) => {
            let cols: Vec<String> = rows_res
                .column_specs()
                .iter()
                .map(|s| s.name().to_string())
                .collect();
            let mut rows_iter = rows_res.rows::<Row>().map_err(|e| format!("{e:?}"))?;
            let mut out_rows = Vec::new();
            while let Some(row_res) = rows_iter.next() {
                let row = row_res.map_err(|e| format!("{e:?}"))?;
                let obj: serde_json::Map<String, JsonValue> = cols
                    .iter()
                    .zip(row.columns.iter())
                    .map(|(name, cell)| {
                        let v = match cell {
                            None => JsonValue::Null,
                            Some(cv) => cql_value_to_json(cv),
                        };
                        (name.clone(), v)
                    })
                    .collect();
                out_rows.push(JsonValue::Object(obj));
            }
            Ok(json!({
                "kind": "rows",
                "columns": cols,
                "rows": out_rows,
            }))
        }
        Err(IntoRowsResultError::ResultNotRows(_)) => Ok(json!({
            "kind": "void",
            "message": "OK — запрос выполнен (ответ без строк, типично для INSERT/UPDATE/DELETE/DDL)."
        })),
        Err(e) => Err(format!("{e:?}")),
    }
}

pub async fn execute_cql_json_with_keyspace(
    session: &Session,
    cql: &str,
    current_keyspace: Option<&str>,
) -> Result<JsonValue, String> {
    if let Some(ks) = current_keyspace {
        if !is_safe_ident(ks) {
            return Err("Некорректное имя keyspace для контекста CQL.".into());
        }
        session
            .use_keyspace(ks, false)
            .await
            .map_err(|e| e.to_string())?;
    }
    execute_cql_json(session, cql).await
}

pub async fn keyspaces(session: &Session, include_system: bool) -> Result<Vec<String>, String> {
    let (cols, rows) = query_to_json(
        session,
        "SELECT keyspace_name FROM system_schema.keyspaces",
    )
    .await?;
    if !cols.iter().any(|c| c == "keyspace_name") {
        return Err("Missing keyspace_name column".into());
    }
    let mut out: Vec<String> = rows
        .into_iter()
        .filter_map(|r| {
            r.get("keyspace_name")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
        })
        .collect();
    if !include_system {
        out.retain(|k| !k.starts_with("system"));
    }
    out.sort();
    Ok(out)
}

pub async fn tables(session: &Session, ks: &str) -> Result<Vec<String>, String> {
    let rs = session
        .query_unpaged(
            "SELECT table_name FROM system_schema.tables WHERE keyspace_name = ?",
            (ks,),
        )
        .await
        .map_err(|e| e.to_string())?;
    let rows_res = rs.into_rows_result().map_err(|e| e.to_string())?;
    let cols: Vec<String> = rows_res
        .column_specs()
        .iter()
        .map(|s| s.name().to_string())
        .collect();
    let mut rows_iter = rows_res.rows::<Row>().map_err(|e| e.to_string())?;
    let mut rows: Vec<JsonValue> = Vec::new();
    while let Some(row_res) = rows_iter.next() {
        let row = row_res.map_err(|e| e.to_string())?;
        let obj: serde_json::Map<String, JsonValue> = cols
            .iter()
            .zip(row.columns.iter())
            .map(|(name, cell)| {
                let v = match cell {
                    None => JsonValue::Null,
                    Some(cv) => cql_value_to_json(cv),
                };
                (name.clone(), v)
            })
            .collect();
        rows.push(JsonValue::Object(obj));
    }
    if !cols.iter().any(|c| c == "table_name") {
        return Err("Unexpected result columns".into());
    }
    let mut out: Vec<String> = rows
        .into_iter()
        .filter_map(|r| r.get("table_name").and_then(|v| v.as_str()).map(String::from))
        .collect();
    out.sort();
    Ok(out)
}

pub fn quote_ident(ks: &str, table: &str) -> Result<String, String> {
    if !is_safe_ident(ks) || !is_safe_ident(table) {
        return Err("Invalid keyspace or table name".into());
    }
    Ok(format!("\"{}\".\"{}\"", ks, table))
}

fn is_safe_ident(s: &str) -> bool {
    !s.is_empty()
        && s.chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_')
        && s.chars().next().is_some_and(|c| c.is_ascii_alphabetic() || c == '_')
}

/// Preview rows without `OFFSET` in CQL — many Scylla/Cassandra builds reject `OFFSET`, which surfaces as a syntax error.
/// We fetch `LIMIT offset+page_size` rows and skip the first `offset` in memory (capped to avoid huge reads).
const PREVIEW_FETCH_CAP: u32 = 100_000;

pub async fn preview_table(session: &Session, ks: &str, table: &str, limit: u32, offset: u32) -> Result<(Vec<String>, Vec<JsonValue>), String> {
    let q = quote_ident(ks, table)?;
    let lim = limit.clamp(1, 500);
    let off = offset.min(1_000_000);
    let need = off.saturating_add(lim);
    if need == 0 {
        return Err("Invalid preview limit".into());
    }
    if need > PREVIEW_FETCH_CAP {
        return Err(format!(
            "Preview would read more than {} rows (offset {} + limit {}). Narrow the page or use a smaller offset.",
            PREVIEW_FETCH_CAP, off, lim
        ));
    }
    let cql = format!("SELECT * FROM {} LIMIT {}", q, need);
    let (cols, rows) = query_to_json(session, &cql).await?;
    let rows: Vec<JsonValue> = rows
        .into_iter()
        .skip(off as usize)
        .take(lim as usize)
        .collect();
    Ok((cols, rows))
}

fn rows_string_column(qr: QueryResult, want_col: &str) -> Result<Vec<String>, String> {
    let rows_res = qr.into_rows_result().map_err(|e| e.to_string())?;
    let cols: Vec<String> = rows_res
        .column_specs()
        .iter()
        .map(|s| s.name().to_string())
        .collect();
    let idx = cols
        .iter()
        .position(|c| c == want_col)
        .ok_or_else(|| format!("missing column {want_col}"))?;
    let mut rows_iter = rows_res.rows::<Row>().map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    while let Some(row_res) = rows_iter.next() {
        let row = row_res.map_err(|e| e.to_string())?;
        if let Some(cell) = row.columns.get(idx) {
            if let Some(CqlValue::Text(s) | CqlValue::Ascii(s)) = cell.as_ref() {
                out.push(s.clone());
            }
        }
    }
    out.sort();
    out.dedup();
    Ok(out)
}

fn rows_two_joined(qr: QueryResult, a: &str, b: &str, sep: &str) -> Result<Vec<String>, String> {
    rows_two_joined_inner(qr, a, b, sep, true)
}

fn cql_cell_as_i32(cell: Option<&CqlValue>) -> i32 {
    match cell {
        Some(CqlValue::Int(i)) => *i,
        Some(CqlValue::SmallInt(i)) => *i as i32,
        Some(CqlValue::TinyInt(i)) => *i as i32,
        Some(CqlValue::BigInt(i)) => (*i).try_into().unwrap_or(i32::MAX),
        _ => i32::MAX,
    }
}

fn rows_columns_display_ordered(qr: QueryResult) -> Result<Vec<String>, String> {
    let rows_res = qr.into_rows_result().map_err(|e| e.to_string())?;
    let cols: Vec<String> = rows_res
        .column_specs()
        .iter()
        .map(|s| s.name().to_string())
        .collect();
    let iname = cols
        .iter()
        .position(|c| c == "column_name")
        .ok_or_else(|| "missing column column_name".to_string())?;
    let itype = cols
        .iter()
        .position(|c| c == "type")
        .ok_or_else(|| "missing column type".to_string())?;
    let ipos = cols
        .iter()
        .position(|c| c == "position")
        .ok_or_else(|| "missing column position".to_string())?;
    let mut rows_iter = rows_res.rows::<Row>().map_err(|e| e.to_string())?;
    let mut pairs: Vec<(i32, String)> = Vec::new();
    while let Some(row_res) = rows_iter.next() {
        let row = row_res.map_err(|e| e.to_string())?;
        let name = row
            .columns
            .get(iname)
            .and_then(|c| c.as_ref())
            .and_then(|v| match v {
                CqlValue::Text(s) | CqlValue::Ascii(s) => Some(s.as_str()),
                _ => None,
            });
        let typ = row
            .columns
            .get(itype)
            .and_then(|c| c.as_ref())
            .and_then(|v| match v {
                CqlValue::Text(s) | CqlValue::Ascii(s) => Some(s.as_str()),
                _ => None,
            });
        if let (Some(n), Some(t)) = (name, typ) {
            let pos = cql_cell_as_i32(row.columns.get(ipos).and_then(|c| c.as_ref()));
            pairs.push((pos, format!("{n}::{t}")));
        }
    }
    pairs.sort_by_key(|(p, _)| *p);
    Ok(pairs.into_iter().map(|(_, s)| s).collect())
}

fn rows_two_joined_inner(
    qr: QueryResult,
    a: &str,
    b: &str,
    sep: &str,
    sort: bool,
) -> Result<Vec<String>, String> {
    let rows_res = qr.into_rows_result().map_err(|e| e.to_string())?;
    let cols: Vec<String> = rows_res
        .column_specs()
        .iter()
        .map(|s| s.name().to_string())
        .collect();
    let ia = cols
        .iter()
        .position(|c| c == a)
        .ok_or_else(|| format!("missing column {a}"))?;
    let ib = cols
        .iter()
        .position(|c| c == b)
        .ok_or_else(|| format!("missing column {b}"))?;
    let mut rows_iter = rows_res.rows::<Row>().map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    while let Some(row_res) = rows_iter.next() {
        let row = row_res.map_err(|e| e.to_string())?;
        let sa = row
            .columns
            .get(ia)
            .and_then(|c| c.as_ref())
            .and_then(|v| match v {
                CqlValue::Text(s) | CqlValue::Ascii(s) => Some(s.as_str()),
                _ => None,
            });
        let sb = row
            .columns
            .get(ib)
            .and_then(|c| c.as_ref())
            .and_then(|v| match v {
                CqlValue::Text(s) | CqlValue::Ascii(s) => Some(s.as_str()),
                _ => None,
            });
        if let (Some(x), Some(y)) = (sa, sb) {
            out.push(format!("{x}{sep}{y}"));
        }
    }
    if sort {
        out.sort();
        out.dedup();
    }
    Ok(out)
}

pub async fn schema_list(
    session: &Session,
    kind: &str,
    keyspace: Option<&str>,
    table: Option<&str>,
) -> Result<Vec<String>, String> {
    match kind {
        "columns" => {
            let ks = keyspace.ok_or("keyspace required")?;
            let tb = table.ok_or("table required")?;
            if !is_safe_ident(ks) || !is_safe_ident(tb) {
                return Err("invalid keyspace or table".into());
            }
            let qr = session
                .query_unpaged(
                    "SELECT column_name, type, position FROM system_schema.columns WHERE keyspace_name = ? AND table_name = ?",
                    (ks, tb),
                )
                .await
                .map_err(|e| e.to_string())?;
            rows_columns_display_ordered(qr)
        }
        "indexes" => {
            let ks = keyspace.ok_or("keyspace required")?;
            if !is_safe_ident(ks) {
                return Err("invalid keyspace".into());
            }
            let qr = if let Some(tb) = table {
                if !is_safe_ident(tb) {
                    return Err("invalid table".into());
                }
                session
                    .query_unpaged(
                        "SELECT index_name FROM system_schema.indexes WHERE keyspace_name = ? AND table_name = ? ALLOW FILTERING",
                        (ks, tb),
                    )
                    .await
                    .map_err(|e| e.to_string())?
            } else {
                session
                    .query_unpaged(
                        "SELECT index_name FROM system_schema.indexes WHERE keyspace_name = ?",
                        (ks,),
                    )
                    .await
                    .map_err(|e| e.to_string())?
            };
            rows_string_column(qr, "index_name")
        }
        "views" => {
            let ks = keyspace.ok_or("keyspace required")?;
            if !is_safe_ident(ks) {
                return Err("invalid keyspace".into());
            }
            let qr = if let Some(tb) = table {
                if !is_safe_ident(tb) {
                    return Err("invalid table".into());
                }
                session
                    .query_unpaged(
                        "SELECT view_name FROM system_schema.views WHERE keyspace_name = ? AND base_table_name = ? ALLOW FILTERING",
                        (ks, tb),
                    )
                    .await
                    .map_err(|e| e.to_string())?
            } else {
                session
                    .query_unpaged(
                        "SELECT view_name FROM system_schema.views WHERE keyspace_name = ?",
                        (ks,),
                    )
                    .await
                    .map_err(|e| e.to_string())?
            };
            rows_string_column(qr, "view_name")
        }
        "types" => {
            let ks = keyspace.ok_or("keyspace required")?;
            if !is_safe_ident(ks) {
                return Err("invalid keyspace".into());
            }
            let qr = session
                .query_unpaged(
                    "SELECT type_name FROM system_schema.types WHERE keyspace_name = ?",
                    (ks,),
                )
                .await
                .map_err(|e| e.to_string())?;
            rows_string_column(qr, "type_name")
        }
        "functions" => {
            let qr = if let Some(ks) = keyspace {
                if !is_safe_ident(ks) {
                    return Err("invalid keyspace".into());
                }
                session
                    .query_unpaged(
                        "SELECT keyspace_name, function_name FROM system_schema.functions WHERE keyspace_name = ?",
                        (ks,),
                    )
                    .await
                    .map_err(|e| e.to_string())?
            } else {
                session
                    .query_unpaged(
                        "SELECT keyspace_name, function_name FROM system_schema.functions",
                        &[],
                    )
                    .await
                    .map_err(|e| e.to_string())?
            };
            rows_two_joined(qr, "keyspace_name", "function_name", ".")
        }
        "aggregates" => {
            let qr = if let Some(ks) = keyspace {
                if !is_safe_ident(ks) {
                    return Err("invalid keyspace".into());
                }
                session
                    .query_unpaged(
                        "SELECT keyspace_name, aggregate_name FROM system_schema.aggregates WHERE keyspace_name = ?",
                        (ks,),
                    )
                    .await
                    .map_err(|e| e.to_string())?
            } else {
                session
                    .query_unpaged(
                        "SELECT keyspace_name, aggregate_name FROM system_schema.aggregates",
                        &[],
                    )
                    .await
                    .map_err(|e| e.to_string())?
            };
            rows_two_joined(qr, "keyspace_name", "aggregate_name", ".")
        }
        "roles" => {
            let qr = session
                .query_unpaged("SELECT role FROM system_auth.roles", &[])
                .await;
            match qr {
                Ok(q) => rows_string_column(q, "role"),
                Err(_) => {
                    let qr2 = session
                        .query_unpaged("SELECT role_name FROM system_auth.roles", &[])
                        .await
                        .map_err(|e| e.to_string())?;
                    rows_string_column(qr2, "role_name")
                }
            }
        }
        "permissions" => {
            let qr = session
                .query_unpaged(
                    "SELECT role, resource FROM system_schema.role_permissions LIMIT 500",
                    &[],
                )
                .await;
            match qr {
                Ok(q) => rows_two_joined(q, "role", "resource", " → "),
                Err(_) => {
                    let qr2 = session
                        .query_unpaged(
                            "SELECT grantee, resource FROM system_schema.role_permissions LIMIT 500",
                            &[],
                        )
                        .await
                        .map_err(|e| e.to_string())?;
                    rows_two_joined(qr2, "grantee", "resource", " → ")
                }
            }
        }
        "system_keyspaces" => {
            let mut all = keyspaces(session, true).await?;
            all.retain(|k| k.starts_with("system"));
            Ok(all)
        }
        _ => Err(format!("unknown schema list kind: {kind}")),
    }
}
