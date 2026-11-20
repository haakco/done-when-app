use std::io::Cursor;

use serde_json::{Value, json};

use crate::support::{FakeApi, temp_config_dir};

fn call(id: u64, name: &str, arguments: Value) -> String {
    json!({ "jsonrpc": "2.0", "id": id, "method": "tools/call", "params": { "name": name, "arguments": arguments } })
        .to_string()
}

fn serve(api: &FakeApi, dir: &std::path::Path, lines: &[String]) -> Vec<Value> {
    let ctx = done_when::context::Context::new(&api.base_url, dir.to_path_buf());
    let input = lines.join("\n") + "\n";
    let mut out = Vec::new();
    done_when::mcp::serve(&ctx, &mut Cursor::new(input), &mut out).unwrap();
    String::from_utf8(out)
        .unwrap()
        .lines()
        .map(|l| serde_json::from_str(l).unwrap())
        .collect()
}

#[test]
fn an_agent_adds_a_measurement_and_reads_the_new_forecast() {
    let api = FakeApi::start();
    let dir = temp_config_dir();
    let lines = vec![
        json!({ "jsonrpc": "2.0", "id": 1, "method": "initialize",
            "params": { "protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": { "name": "t", "version": "1" } } })
        .to_string(),
        json!({ "jsonrpc": "2.0", "method": "notifications/initialized" }).to_string(),
        json!({ "jsonrpc": "2.0", "id": 2, "method": "tools/list" }).to_string(),
        call(3, "create_counter", json!({ "name": "Tasks", "target": 100, "start": 1, "deadline": "2026-12-01" })),
        call(8, "add_measurement", json!({ "item": "item-0", "value": 15 })),
        call(4, "add_measurement", json!({ "item": "item-0", "value": 30 })),
        call(5, "read_forecast", json!({ "item": "Tasks" })),
        call(6, "add_measurement", json!({ "item": format!("{}/c/shr-0", api.base_url), "value": 31 })),
        call(7, "list_items", json!({})),
    ];
    let replies = serve(&api, &dir, &lines);
    assert_eq!(replies.len(), 8, "a notification gets no reply");
    assert_eq!(
        replies[7]["result"]["structuredContent"]["items"][0]["kind"],
        "counter"
    );
    assert_eq!(replies[5]["result"]["structuredContent"]["kind"], "counter");
    assert_eq!(replies[0]["result"]["protocolVersion"], "2025-06-18");

    let tools = replies[1]["result"]["tools"].as_array().unwrap();
    let hint = |name: &str, field: &str| {
        tools.iter().find(|t| t["name"] == name).unwrap()["annotations"][field].clone()
    };
    assert_eq!(hint("read_forecast", "readOnlyHint"), true);
    assert_eq!(hint("list_items", "readOnlyHint"), true);
    assert_eq!(hint("read_model_run", "readOnlyHint"), true);
    assert_eq!(hint("run_model", "readOnlyHint"), false);
    assert_eq!(hint("add_measurement", "readOnlyHint"), false);
    assert_eq!(hint("create_counter", "destructiveHint"), false);

    let created = &replies[2]["result"];
    assert_eq!(created["isError"], false);
    assert!(
        !created.to_string().contains("own-0"),
        "owner token never leaves the machine"
    );
    assert_eq!(
        replies[4]["result"]["structuredContent"]["forecast"]["deadlineProbability"],
        0.75
    );
    let forecast = &replies[5]["result"]["structuredContent"]["forecast"];
    assert_eq!(forecast["deadlineProbability"], 0.75);
    assert_eq!(forecast["inputCount"], 3);

    let refused = &replies[6]["result"];
    assert_eq!(refused["isError"], true);
    assert!(
        refused["content"][0]["text"]
            .as_str()
            .unwrap()
            .contains("read-only")
    );
    assert_eq!(api.count("POST", "/api/v1/app/item/measurements"), 3);
}

#[test]
fn version_fallback_and_protocol_errors() {
    let api = FakeApi::start();
    let lines = vec![
        json!({ "jsonrpc": "2.0", "id": "a", "method": "initialize", "params": { "protocolVersion": "1999-01-01" } })
            .to_string(),
        json!({ "jsonrpc": "2.0", "id": 2, "method": "resources/list" }).to_string(),
        "not json".to_owned(),
    ];
    let replies = serve(&api, &temp_config_dir(), &lines);
    assert_eq!(replies[0]["result"]["protocolVersion"], "2025-11-25");
    assert_eq!(replies[1]["error"]["code"], -32601);
    assert_eq!(replies[2]["error"]["code"], -32700);
}
