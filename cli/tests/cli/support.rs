//! A small in-memory Done When API on a std TcpListener: the discovery file, the app item routes
//! and the app forecast routes, enough for the commands, `watch` and MCP to run end to end.

use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;

use serde_json::{Value, json};

#[derive(Debug, Clone)]
pub struct Received {
    pub method: String,
    pub target: String,
    pub headers: Vec<(String, String)>,
    pub body: String,
}

impl Received {
    pub fn header(&self, name: &str) -> Option<&str> {
        self.headers
            .iter()
            .find(|(k, _)| k.eq_ignore_ascii_case(name))
            .map(|(_, v)| v.as_str())
    }
}

#[derive(Default)]
struct Item {
    uuid: String,
    kind: String,
    name: String,
    unit: String,
    version: i64,
    measurements: Vec<f64>,
    forecast_version: Option<i64>,
    entries: Vec<(String, String)>,
    status: String,
}

#[derive(Default)]
struct State {
    items: Vec<Item>,
}

pub struct FakeApi {
    pub base_url: String,
    log: Arc<Mutex<Vec<Received>>>,
}

impl FakeApi {
    pub fn start() -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let base_url = format!("http://{}", listener.local_addr().unwrap());
        let log = Arc::new(Mutex::new(Vec::new()));
        let state = Arc::new(Mutex::new(State::default()));
        let (server_log, server_base) = (log.clone(), base_url.clone());
        thread::spawn(move || {
            for stream in listener.incoming() {
                let mut stream = stream.unwrap();
                let request = read_request(&mut BufReader::new(stream.try_clone().unwrap()));
                server_log.lock().unwrap().push(request.clone());
                let (status, etag, body) =
                    answer(&server_base, &mut state.lock().unwrap(), &request);
                write_answer(&mut stream, status, etag.as_deref(), &body);
            }
        });
        Self { base_url, log }
    }

    pub fn requests(&self) -> Vec<Received> {
        self.log.lock().unwrap().clone()
    }

    pub fn count(&self, method: &str, path: &str) -> usize {
        self.requests()
            .iter()
            .filter(|r| r.method == method && r.target.split('?').next() == Some(path))
            .count()
    }
}

/// A fresh, empty config directory, removed when the test ends.
pub struct TempDir(PathBuf);

impl std::ops::Deref for TempDir {
    type Target = std::path::Path;
    fn deref(&self) -> &std::path::Path {
        &self.0
    }
}

impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

pub fn temp_config_dir() -> TempDir {
    static NEXT: AtomicUsize = AtomicUsize::new(0);
    let dir = std::env::temp_dir().join(format!(
        "done-when-test-{}-{}",
        std::process::id(),
        NEXT.fetch_add(1, Ordering::SeqCst)
    ));
    let _ = std::fs::remove_dir_all(&dir);
    TempDir(dir)
}

fn token_index(request: &Received) -> Option<(usize, bool)> {
    let token = request.header("authorization")?.strip_prefix("Bearer ")?;
    let (role, index) = token.split_once('-')?;
    Some((index.parse().ok()?, role == "own"))
}

fn answer(base: &str, state: &mut State, request: &Received) -> (u16, Option<String>, String) {
    let path = request.target.split('?').next().unwrap_or("");
    if path == "/.well-known/custd.json" {
        return ok(json!({
            "apiBaseUrl": base, "host": base, "siteUuid": "s-1", "browserKey": "site_pk_test",
            "environment": "prod", "capabilities": ["app_data", "sign_in"],
            "signIn": { "issuer": "https://auth.example", "clientId": "done-when", "audience": "custd",
                "authorizationEndpoint": "x", "tokenEndpoint": "y", "redirectUri": "z" }
        }));
    }
    if (request.method.as_str(), path) == ("POST", "/api/v1/app/items") {
        return create(state, request);
    }
    let Some((index, owner)) = token_index(request) else {
        return problem(401, "app_link_refused");
    };
    let Some(item) = state.items.get_mut(index) else {
        return problem(404, "app_item_not_found");
    };
    let is_write = request.method != "GET";
    if is_write && !owner {
        return problem(403, "app_link_read_only");
    }
    route(item, request, path, owner)
}

fn create(state: &mut State, request: &Received) -> (u16, Option<String>, String) {
    let body: Value = serde_json::from_str(&request.body).unwrap();
    let index = state.items.len();
    let kind = body["kind"].as_str().unwrap().to_owned();
    state.items.push(Item {
        uuid: format!("item-{index}"),
        name: body["measurementProject"]["name"]
            .as_str()
            .unwrap_or("")
            .to_owned(),
        unit: body["measurementProject"]["series"][0]["name"]
            .as_str()
            .unwrap_or("")
            .to_owned(),
        kind,
        version: 1,
        status: "active".to_owned(),
        ..Item::default()
    });
    let read = item_read(&state.items[index], true);
    let created = json!({ "item": read, "ownerToken": format!("own-{index}"), "shareToken": format!("shr-{index}") });
    (201, None, created.to_string())
}

fn route(
    item: &mut Item,
    request: &Received,
    path: &str,
    owner: bool,
) -> (u16, Option<String>, String) {
    let body: Value = serde_json::from_str(&request.body).unwrap_or(Value::Null);
    match (request.method.as_str(), path) {
        ("GET", "/api/v1/app/item") => conditional(request, item.version, item_read(item, owner)),
        ("POST", "/api/v1/app/item/measurements") => {
            let rows = body["rows"].as_array().unwrap();
            let results: Vec<Value> = (0..rows.len())
                .map(|i| json!({ "rowIndex": i, "success": true, "status": 201, "observationUuid": format!("o-{i}") }))
                .collect();
            item.measurements
                .extend(rows.iter().map(|r| r["value"].as_f64().unwrap()));
            item.version += 1;
            ok(
                json!({ "importId": "imp-1", "accepted": rows.len(), "rejected": 0, "results": results }),
            )
        }
        ("POST", "/api/v1/app/forecast/runs") if item.name == "Flaky" => problem(500, "internal"),
        ("POST", "/api/v1/app/forecast/runs") => {
            item.version += 1;
            item.forecast_version = Some(item.version);
            ok(forecast(item))
        }
        ("GET", "/api/v1/app/forecast/latest") => match item.forecast_version {
            Some(version) => conditional(request, version, forecast(item)),
            None => problem(404, "app_forecast_not_found"),
        },
        ("POST", "/api/v1/app/item/estimates") => ok(json!({
            "estimateUuid": "e-1", "estimatedAt": "2026-11-18T00:00:00Z",
            "lowDate": body["lowDate"], "highDate": body["highDate"], "note": body["note"].as_str().unwrap_or("")
        })),
        ("POST", "/api/v1/app/item/complete") => {
            item.status = "completed".to_owned();
            ok(item_read(item, owner))
        }
        ("POST", "/api/v1/app/item/entries") => {
            let token = body["token"].as_str().unwrap();
            let entry = (
                format!("entry-{}", item.entries.len()),
                format!("item-{}", &token[4..]),
            );
            item.entries.push(entry.clone());
            ok(
                json!({ "entryUuid": entry.0, "itemUuid": entry.1, "kind": "measurement_project",
                "position": item.entries.len(), "createdAt": "2026-11-18T00:00:00Z" }),
            )
        }
        ("DELETE", entry) if entry.starts_with("/api/v1/app/item/entries/") => {
            let id = entry.rsplit('/').next().unwrap();
            item.entries.retain(|(uuid, _)| uuid != id);
            (204, None, String::new())
        }
        _ => problem(404, "not_found"),
    }
}

fn conditional(request: &Received, version: i64, body: Value) -> (u16, Option<String>, String) {
    let etag = format!("\"v{version}\"");
    if request.header("if-none-match") == Some(etag.as_str()) {
        return (304, Some(etag), String::new());
    }
    (200, Some(etag), body.to_string())
}

fn item_read(item: &Item, owner: bool) -> Value {
    let role = if owner { "owner" } else { "share" };
    let mut read = json!({
        "item": { "itemUuid": item.uuid, "kind": item.kind, "role": role, "version": item.version,
            "idleExpirySeconds": 604800, "updatedAt": "2026-11-18T00:00:00Z", "expiresAt": "2026-11-25T00:00:00Z" },
        "links": null
    });
    if item.kind == "link_collection" {
        let entries: Vec<Value> = item
            .entries
            .iter()
            .enumerate()
            .map(|(i, (entry, item_uuid))| {
                json!({
            "entryUuid": entry, "itemUuid": item_uuid, "kind": "measurement_project", "position": i,
            "createdAt": "2026-11-18T00:00:00Z" })
            })
            .collect();
        read["linkCollection"] = json!({ "entries": entries });
        return read;
    }
    read["measurementProject"] = json!({
        "projectUuid": "p-1", "projectCode": "app-1", "kind": "deadline_forecast", "status": item.status,
        "name": item.name, "description": "",
        "series": [{ "seriesUuid": "series-1", "seriesCode": "value", "name": item.unit, "unitSlug": "unitless",
            "completionDirection": "increase", "source": "manual" }],
        "target": { "targetUuid": "t-1", "targetCode": "done", "name": item.name, "targetValue": 100.0,
            "targetDate": "2026-12-01T00:00:00Z", "completedAt": null, "state": "active" },
        "delivery": { "definitionOfDone": "", "targetDate": null, "completedAt": null },
        "run": { "similar": false, "forecastMethod": null, "seriesRootUuid": null },
        "createdAt": "2026-11-18T00:00:00Z", "updatedAt": "2026-11-18T00:00:00Z"
    });
    read["estimates"] = json!({ "deliveryTargetDate": null, "estimates": [], "latest": null });
    read
}

/// The chance by the deadline rises with the number of measurements, so a test can see it move.
fn forecast(item: &Item) -> Value {
    let chance = (0.25 * item.measurements.len() as f64).min(0.95);
    let line = |offset: f64| {
        json!({ "points": [
        { "at": "2026-11-18T00:00:00Z", "value": 10.0 },
        { "at": "2026-11-25T00:00:00Z", "value": 50.0 + offset },
        { "at": "2026-12-02T00:00:00Z", "value": 100.0 + offset } ] })
    };
    json!({
        "forecastRunUuid": "run-1", "projectUuid": "p-1", "status": "completed",
        "method": "bayesian_linear_regression", "generatedAt": "2026-11-18T00:00:00Z", "forecastFrom": null,
        "inputCount": item.measurements.len(), "sampleCount": 3, "seed": 1, "percentiles": null,
        "provenance": null, "warnings": null,
        "counter": { "pooledRunCount": 1, "deadlineProbability": chance,
            "completionInterval": { "confidence": 0.9, "lower": "2026-11-28T00:00:00Z", "upper": "2026-12-05T00:00:00Z" },
            "rate": { "perSecond": 0.0001, "perMinute": 0.006, "perHour": 0.36, "perDay": 8.64 },
            "detail": { "posteriorLines": [line(-10.0), line(0.0), line(10.0)],
                "arrivalHistogram": { "bins": [], "neverCount": 0 } } }
    })
}

fn ok(body: Value) -> (u16, Option<String>, String) {
    (200, None, body.to_string())
}

fn problem(status: u16, code: &str) -> (u16, Option<String>, String) {
    let body = json!({ "type": "about:blank", "title": code, "status": status, "code": code });
    (status, None, body.to_string())
}

fn read_request(reader: &mut impl BufRead) -> Received {
    let mut line = String::new();
    reader.read_line(&mut line).unwrap();
    let mut parts = line.split_whitespace();
    let method = parts.next().unwrap_or("").to_owned();
    let target = parts.next().unwrap_or("").to_owned();
    let mut headers = Vec::new();
    loop {
        let mut header = String::new();
        reader.read_line(&mut header).unwrap();
        let Some((name, value)) = header.trim_end().split_once(": ") else {
            break;
        };
        headers.push((name.to_owned(), value.to_owned()));
    }
    let length = headers
        .iter()
        .find(|(k, _)| k.eq_ignore_ascii_case("content-length"))
        .map_or(0, |(_, v)| v.parse().unwrap());
    let mut body = vec![0; length];
    reader.read_exact(&mut body).unwrap();
    Received {
        method,
        target,
        headers,
        body: String::from_utf8(body).unwrap(),
    }
}

fn write_answer(stream: &mut impl Write, status: u16, etag: Option<&str>, body: &str) {
    let mut head = format!(
        "HTTP/1.1 {status} X\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: {}\r\n",
        body.len()
    );
    if let Some(etag) = etag {
        head.push_str(&format!("ETag: {etag}\r\n"));
    }
    let _ = stream.write_all(format!("{head}\r\n{body}").as_bytes());
}

/// Runs the CLI in-process with `stdin` as input.
pub fn run(base: &str, dir: &std::path::Path, args: &[&str], stdin: &str) -> (i32, String, String) {
    let mut full = vec!["done-when", "--host", base];
    full.extend_from_slice(args);
    let cli = <done_when::cli::Cli as clap::Parser>::try_parse_from(full).unwrap();
    let (mut out, mut err) = (Vec::new(), Vec::new());
    let code = done_when::cli::execute(
        cli,
        dir.to_path_buf(),
        &mut stdin.as_bytes(),
        &mut out,
        &mut err,
    );
    (
        code,
        String::from_utf8(out).unwrap(),
        String::from_utf8(err).unwrap(),
    )
}
