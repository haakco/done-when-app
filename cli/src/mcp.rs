//! A stdio MCP server: newline-delimited JSON-RPC 2.0 on stdin/stdout, nothing else on stdout.
//! Tools act with the owner links saved on this machine (or a link the agent passes), through
//! the same app item routes people use. Each tool declares its side effects in `annotations`.

use std::io::{BufRead, Write};

use serde::Serialize;
use serde_json::{Value, json};

use crate::context::Context;
use crate::error::{CliError, CliResult};
use crate::ops::{self, CounterDraft};

/// `initialize` echoes a supported version and answers the newest otherwise. 2026-07-28
/// (per-request `_meta`, `server/discover`, cache hints) is not implemented.
const SUPPORTED_VERSIONS: [&str; 3] = ["2025-11-25", "2025-06-18", "2025-03-26"];
const INSTRUCTIONS: &str = "Track work as Done When counters. create_counter returns an itemUuid; \
pass it as `item` to add_measurement and read_forecast. Owner links stay on this machine and are never returned.";

const PARSE_ERROR: i64 = -32700;
const INVALID_REQUEST: i64 = -32600;
const METHOD_NOT_FOUND: i64 = -32601;
const INVALID_PARAMS: i64 = -32602;

pub fn serve(ctx: &Context, input: &mut dyn BufRead, out: &mut dyn Write) -> CliResult<()> {
    let mut line = String::new();
    loop {
        line.clear();
        if input.read_line(&mut line)? == 0 {
            return Ok(());
        }
        if line.trim().is_empty() {
            continue;
        }
        if let Some(reply) = handle_line(ctx, &line) {
            writeln!(out, "{reply}")?;
            out.flush()?;
        }
    }
}

/// One message in, at most one reply out. Notifications get no reply.
pub fn handle_line(ctx: &Context, line: &str) -> Option<Value> {
    let message: Value = match serde_json::from_str(line) {
        Ok(message) => message,
        Err(_) => return Some(error_reply(Value::Null, PARSE_ERROR, "parse error")),
    };
    let id = message.get("id").cloned()?;
    let Some(method) = message.get("method").and_then(Value::as_str) else {
        return Some(error_reply(id, INVALID_REQUEST, "missing method"));
    };
    let params = message.get("params").cloned().unwrap_or(Value::Null);
    Some(match method {
        "initialize" => result_reply(id, initialize(&params)),
        "ping" => result_reply(id, json!({})),
        "tools/list" => result_reply(id, json!({ "tools": tool_definitions() })),
        "tools/call" => match call_tool(ctx, &params) {
            Ok(result) => result_reply(id, result),
            Err(message) => error_reply(id, INVALID_PARAMS, &message),
        },
        _ => error_reply(id, METHOD_NOT_FOUND, "method not found"),
    })
}

fn server_info() -> Value {
    json!({ "name": "done-when", "version": env!("CARGO_PKG_VERSION") })
}

fn capabilities() -> Value {
    json!({ "tools": { "listChanged": false } })
}

fn initialize(params: &Value) -> Value {
    let requested = params.get("protocolVersion").and_then(Value::as_str);
    let version = requested
        .filter(|v| SUPPORTED_VERSIONS.contains(v))
        .unwrap_or(SUPPORTED_VERSIONS[0]);
    json!({
        "protocolVersion": version,
        "capabilities": capabilities(),
        "serverInfo": server_info(),
        "instructions": INSTRUCTIONS,
    })
}

/// A tool's side effects, as MCP tool annotations.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SideEffect {
    ReadOnly,
    /// Adds data; never deletes or overwrites.
    Additive,
}

pub struct Tool {
    pub name: &'static str,
    pub title: &'static str,
    pub description: &'static str,
    pub side_effect: SideEffect,
    schema: fn() -> Value,
}

pub const TOOLS: [Tool; 4] = [
    Tool {
        name: "create_counter",
        title: "Create a counter",
        description: "Start a counter from a start value towards a target; returns its itemUuid and share link.",
        side_effect: SideEffect::Additive,
        schema: || {
            object(
                json!({
                    "name": { "type": "string" },
                    "target": { "type": "number" },
                    "unit": { "type": "string", "description": "For example `tasks`." },
                    "start": { "type": "number", "description": "The value now." },
                    "deadline": { "type": "string", "description": "YYYY-MM-DD or RFC 3339." }
                }),
                &["name", "target"],
            )
        },
    },
    Tool {
        name: "add_measurement",
        title: "Add a measurement",
        description: "Record the counter's current value (or a value at a time) and rerun its forecast.",
        side_effect: SideEffect::Additive,
        schema: || {
            object(
                json!({
                    "item": { "type": "string", "description": ITEM_DESCRIPTION },
                    "value": { "type": "number" },
                    "at": { "type": "string", "description": "RFC 3339; default now." }
                }),
                &["item", "value"],
            )
        },
    },
    Tool {
        name: "read_forecast",
        title: "Read the forecast",
        description: "Read a counter's status, completion interval and chance of meeting its deadline.",
        side_effect: SideEffect::ReadOnly,
        schema: || {
            object(
                json!({ "item": { "type": "string", "description": ITEM_DESCRIPTION } }),
                &["item"],
            )
        },
    },
    Tool {
        name: "list_items",
        title: "List items",
        description: "List the items saved on this machine with their share links.",
        side_effect: SideEffect::ReadOnly,
        schema: || object(json!({}), &[]),
    },
];

const ITEM_DESCRIPTION: &str = "An itemUuid or name saved here, or a Done When share/owner link.";

fn object(properties: Value, required: &[&str]) -> Value {
    json!({ "type": "object", "properties": properties, "required": required, "additionalProperties": false })
}

fn tool_definitions() -> Vec<Value> {
    TOOLS
        .iter()
        .map(|tool| {
            let read_only = tool.side_effect == SideEffect::ReadOnly;
            json!({
                "name": tool.name,
                "title": tool.title,
                "description": tool.description,
                "inputSchema": (tool.schema)(),
                "annotations": {
                    "title": tool.title,
                    "readOnlyHint": read_only,
                    "destructiveHint": false,
                    "idempotentHint": read_only,
                    "openWorldHint": false
                }
            })
        })
        .collect()
}

/// A tool failure is a result with `isError`, so the agent sees it; bad params are a protocol error.
fn call_tool(ctx: &Context, params: &Value) -> Result<Value, String> {
    let name = params
        .get("name")
        .and_then(Value::as_str)
        .ok_or("missing tool name")?;
    let args = params
        .get("arguments")
        .cloned()
        .unwrap_or_else(|| json!({}));
    let outcome = match name {
        "create_counter" => {
            counter_draft(&args).map(|draft| as_json(ops::create_counter(ctx, &draft)))?
        }
        "add_measurement" => {
            let item = text_arg(&args, "item")?;
            let value = number_arg(&args, "value")?;
            let at = match args.get("at").and_then(Value::as_str) {
                Some(at) => ops::timestamp(at).map_err(|e| e.to_string())?,
                None => crate::time::now_rfc3339(),
            };
            as_json(ops::add_measurements(ctx, &item, &[(at, value)]))
        }
        "read_forecast" => as_json(ops::show(ctx, &text_arg(&args, "item")?)),
        "list_items" => as_json(ops::list(ctx)),
        _ => return Err(format!("unknown tool {name:?}")),
    };
    Ok(match outcome {
        Ok(value) => json!({
            "content": [{ "type": "text", "text": value.to_string() }],
            "structuredContent": value,
            "isError": false
        }),
        Err(error) => json!({
            "content": [{ "type": "text", "text": error.to_string() }],
            "isError": true
        }),
    })
}

fn as_json(result: CliResult<impl Serialize>) -> CliResult<Value> {
    result
        .and_then(|report| serde_json::to_value(report).map_err(|e| CliError::Usage(e.to_string())))
}

fn counter_draft(args: &Value) -> Result<CounterDraft, String> {
    Ok(CounterDraft {
        name: text_arg(args, "name")?,
        target: number_arg(args, "target")?,
        unit: args.get("unit").and_then(Value::as_str).map(str::to_owned),
        start: args.get("start").and_then(Value::as_f64),
        started_at: None,
        deadline: args
            .get("deadline")
            .and_then(Value::as_str)
            .map(str::to_owned),
    })
}

fn text_arg(args: &Value, name: &str) -> Result<String, String> {
    args.get(name)
        .and_then(Value::as_str)
        .map(str::to_owned)
        .ok_or_else(|| format!("argument {name:?} must be a string"))
}

fn number_arg(args: &Value, name: &str) -> Result<f64, String> {
    args.get(name)
        .and_then(Value::as_f64)
        .ok_or_else(|| format!("argument {name:?} must be a number"))
}

fn result_reply(id: Value, result: Value) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "result": result })
}

fn error_reply(id: Value, code: i64, message: &str) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": message } })
}
