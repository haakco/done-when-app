//! The operation map: every API operation the Custd Rust SDK exposes, and the command that uses
//! it or the reason it is deferred. `tests/operations.rs` fails when the SDK gains an operation
//! that is missing here.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Coverage {
    /// The commands (and MCP tools) that call it.
    Command(&'static str),
    /// Why no command calls it yet.
    Deferred(&'static str),
}

use Coverage::{Command, Deferred};

const TENANT_ADMIN: Coverage = Deferred(
    "tenant admin route behind an admin credential; Done When users act through the app item routes",
);

pub const OPERATIONS: &[(&str, Coverage)] = &[
    ("DeviceLogin::run", Command("login")),
    (
        "AppClient::create_item",
        Command("new counter, dashboard create, mcp create_counter"),
    ),
    (
        "AppLink::read",
        Command("show, watch, share, and the role check before every write"),
    ),
    (
        "AppLink::add_measurements",
        Command("add, add --csv, new counter --start, mcp add_measurement"),
    ),
    (
        "AppLink::import_measurements_csv",
        Deferred(
            "add --csv reads the app's timestamp,value CSV and sends add_measurements; the server CSV needs seriesUuid,observedAt,value headers",
        ),
    ),
    ("AppLink::create_estimate", Command("estimate")),
    ("AppLink::complete", Command("complete")),
    (
        "AppLink::cancel",
        Deferred("not in the B7 command set; the web owner page cancels"),
    ),
    (
        "AppLink::reopen",
        Deferred("not in the B7 command set; the web owner page reopens"),
    ),
    ("AppLink::add_entry", Command("dashboard add")),
    ("AppLink::remove_entry", Command("dashboard remove")),
    (
        "AppLink::revoke_link",
        Deferred("link management stays on the web owner page"),
    ),
    (
        "AppLink::rotate_link",
        Deferred("link management stays on the web owner page"),
    ),
    (
        "AppLink::run_forecast",
        Command("add (after every measurement write), mcp add_measurement"),
    ),
    (
        "AppLink::latest_forecast",
        Command("show, watch, mcp read_forecast"),
    ),
    (
        "AppLink::forecast_run",
        Deferred("the commands read the latest run only"),
    ),
    ("CustdClient::create_measurement_project", TENANT_ADMIN),
    ("CustdClient::list_measurement_projects", TENANT_ADMIN),
    ("CustdClient::get_measurement_project", TENANT_ADMIN),
    ("CustdClient::add_measurement_observations", TENANT_ADMIN),
    (
        "CustdClient::import_measurement_observations_csv",
        TENANT_ADMIN,
    ),
    ("CustdClient::create_project_estimate", TENANT_ADMIN),
    ("CustdClient::list_project_estimates", TENANT_ADMIN),
    ("CustdClient::complete_project", TENANT_ADMIN),
    ("CustdClient::run_measurement_forecast", TENANT_ADMIN),
    ("CustdClient::get_measurement_forecast_run", TENANT_ADMIN),
];

/// Public SDK functions that build clients rather than call the API.
pub const NOT_OPERATIONS: &[&str] = &["AppClient::new", "AppClient::link", "CustdClient::new"];

/// App API operations Done When needs that the SDK does not expose yet.
pub const SDK_GAPS: &[(&str, &str)] = &[
    (
        "listAppItems",
        "`list` for a signed-in user (\"my items\"); `list` shows local items meanwhile",
    ),
    ("claimAppItem", "claiming an anonymous item after `login`"),
    (
        "user access token on item routes",
        "creating and reading items as the signed-in user",
    ),
    (
        "app forecast story",
        "the live view's measurement history; it shows measurements added here meanwhile",
    ),
    (
        "hosted app discovery",
        "reading /.well-known/custd.json; the CLI reads it itself",
    ),
];
