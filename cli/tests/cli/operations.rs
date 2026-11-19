//! Every API operation the Custd Rust SDK exposes has a command or a recorded deferral.

use std::path::PathBuf;
use std::process::Command;

use done_when::operations::{NOT_OPERATIONS, OPERATIONS};

const SDK_SOURCES: [&str; 9] = [
    "src/app.rs",
    "src/app_alerts.rs",
    "src/app_meetings.rs",
    "src/app_story.rs",
    "src/browser_login.rs",
    "src/client.rs",
    "src/device.rs",
    "src/discovery.rs",
    "src/measurement.rs",
];

fn sdk_root() -> PathBuf {
    let output = Command::new(env!("CARGO"))
        .args([
            "metadata",
            "--locked",
            "--format-version",
            "1",
            "--manifest-path",
        ])
        .arg(concat!(env!("CARGO_MANIFEST_DIR"), "/Cargo.toml"))
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let metadata: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
    let package = metadata["packages"]
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["name"] == "custd-sdk")
        .unwrap();
    PathBuf::from(package["manifest_path"].as_str().unwrap())
        .parent()
        .unwrap()
        .to_owned()
}

/// `Type::method` for every `pub fn` in an inherent `impl Type` block, and the bare name of
/// every top-level `pub fn`.
fn sdk_operations() -> Vec<String> {
    let root = sdk_root();
    let mut found = Vec::new();
    for file in SDK_SOURCES {
        let source = std::fs::read_to_string(root.join(file)).unwrap();
        let mut current: Option<String> = None;
        for line in source.lines() {
            if let Some(rest) = line.strip_prefix("impl ") {
                let inherent = !rest.contains(" for ");
                current = inherent.then(|| rest.split(['<', ' ']).next().unwrap().to_owned());
            } else if let Some(rest) = line.strip_prefix("pub fn ") {
                found.push(rest.split(['(', '<']).next().unwrap().to_owned());
            } else if line.starts_with('}') {
                current = None;
            } else if let (Some(owner), Some(rest)) = (&current, line.strip_prefix("    pub fn ")) {
                found.push(format!(
                    "{owner}::{}",
                    rest.split(['(', '<']).next().unwrap()
                ));
            }
        }
    }
    found
}

#[test]
fn every_sdk_operation_has_a_command_or_a_deferral() {
    let sdk = sdk_operations();
    assert!(sdk.len() > 20, "the scan found the SDK's methods: {sdk:?}");
    for operation in &sdk {
        let mapped = OPERATIONS.iter().any(|(name, _)| name == operation);
        assert!(
            mapped || NOT_OPERATIONS.contains(&operation.as_str()),
            "{operation} has neither a command nor a deferral in src/operations.rs"
        );
    }
    for (name, _) in OPERATIONS {
        assert!(
            sdk.iter().any(|op| op == name),
            "{name} is mapped but the SDK no longer has it"
        );
    }
}
