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
const MEETING_STEP: Coverage =
    Deferred("meetings are read-only here (show, list); the web meeting page runs them live");
const ALERTS: Coverage = Deferred("alerts are set up on the web owner page");

pub const OPERATIONS: &[(&str, Coverage)] = &[
    ("BrowserLogin::run", Command("login")),
    (
        "DeviceLogin::run",
        Deferred("hosted app sign-in uses browser PKCE"),
    ),
    (
        "device_user_code_groups",
        Deferred("device codes do not grant hosted application authority"),
    ),
    (
        "read_hosted_app_discovery",
        Command("every command that calls the API, once per run"),
    ),
    (
        "AppClient::list_my_items",
        Command("list, mcp list_items, and name or UUID lookup while signed in"),
    ),
    ("AppLink::claim", Command("claim")),
    (
        "AppLink::forecast_story",
        Command("watch (measurement history)"),
    ),
    ("AppLink::plan_forecast", Command("show")),
    ("AppLink::run_model", Command("model run, mcp run_model")),
    (
        "AppLink::latest_model_run",
        Command("model show, mcp read_model_run, TUI model details"),
    ),
    ("AppLink::update_meeting_minutes", MEETING_STEP),
    (
        "AppLink::update_plan",
        Deferred("edit dependencies on the web plan page"),
    ),
    ("AppLink::start_meeting", MEETING_STEP),
    ("AppLink::advance_meeting", MEETING_STEP),
    ("AppLink::end_meeting", MEETING_STEP),
    ("AppLink::alert_settings", ALERTS),
    ("AppLink::alert_deliveries", ALERTS),
    ("AppLink::add_alert_rule", ALERTS),
    ("AppLink::remove_alert_rule", ALERTS),
    ("AppLink::add_alert_webhook", ALERTS),
    ("AppLink::add_alert_slack", ALERTS),
    ("AppLink::remove_alert_webhook", ALERTS),
    ("AppLink::subscribe_alert_email", ALERTS),
    ("AppLink::unsubscribe_alert_email", ALERTS),
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

/// Public SDK functions that build clients rather than call the API. `with_user_token` is
/// applied to every app client while a session is valid; `owned_item` reaches "my items";
/// `with_acting_company` names a tenant for system-administrator cleanup jobs.
pub const NOT_OPERATIONS: &[&str] = &[
    "BrowserLogin::new",
    "AppClient::new",
    "AppClient::from_discovery",
    "AppClient::with_user_token",
    "AppClient::link",
    "AppClient::owned_item",
    "CustdClient::new",
    "CustdClient::with_acting_company",
];
