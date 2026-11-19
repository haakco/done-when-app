//! The operations behind the commands and the MCP tools. Each one resolves an item reference,
//! calls the SDK and returns a typed report. Writes check the link's role first, so a share
//! link never sends a write.

use custd_sdk::{
    APP_ITEM_KIND_LINK_COLLECTION, APP_ITEM_KIND_MEASUREMENT_PROJECT, APP_ITEM_KIND_MEETING,
    ApiError, AppClient, AppForecastStory, AppItemCreate, AppItemRead, AppLink,
    AppMeasurementProjectCreate, AppMeeting, AppReadOptions, Conditional, Error,
    MeasurementForecastRun, MeasurementForecastRunRequest, MeasurementObservation,
    MeasurementObservationBulk, MeasurementSeriesCreate, MeasurementTargetCreate, ProjectComplete,
    ProjectEstimateCreate,
};
use serde::Serialize;

use crate::context::Context;
use crate::error::{CliError, CliResult};
use crate::links::{Access, ItemKind, card_url, item_url, parse_link};
use crate::store::{StoredItem, StoredSession};
use crate::time::{now_rfc3339, now_seconds, parse_rfc3339};

const FORECAST_MIN_MEASUREMENTS: i64 = 3;
const COUNTER_PROJECT_KIND: &str = "deadline_forecast";
/// The first series' code tells the item kinds apart, as in the web app's `itemKindOf`.
pub const COUNTER_SERIES_CODE: &str = "value";
pub const PROJECT_SERIES_CODE: &str = "estimate";
/// The SDK has no constant for model items yet; the web app's SDK names it `uncertainty_model`.
const APP_ITEM_KIND_MODEL: &str = "uncertainty_model";
const CLAIMED_BY_SOMEONE_ELSE: &str = "app_item_claimed";
const COMPLETION_INCREASE: &str = "increase";
const SOURCE_MANUAL: &str = "manual";
const TARGET_CODE: &str = "done";
const TARGET_ACTIVE: &str = "active";
/// Custd's unit slugs are a closed lookup table, so a counter's free-text unit is its series name.
const UNIT_SLUG: &str = "unitless";
const ROLE_OWNER: &str = "owner";
const ROLE_SHARE: &str = "share";
const SIGN_IN_SCOPES: [&str; 3] = ["openid", "profile", "offline_access"];

/// How the item routes reach an item: with a link token, or as the signed-in owner by UUID.
#[derive(Debug, Clone)]
pub enum Reach {
    Link(String),
    Owned(String),
}

/// An item reference resolved to how it is reached, with what is saved locally about it.
pub struct Resolved {
    pub reach: Reach,
    pub stored: Option<StoredItem>,
}

impl Resolved {
    pub fn link<'a>(&self, app: &'a AppClient) -> AppLink<'a> {
        match &self.reach {
            Reach::Link(token) => app.link(token.clone()),
            Reach::Owned(item_uuid) => app.owned_item(item_uuid.clone()),
        }
    }

    pub fn token(&self) -> Option<&str> {
        match &self.reach {
            Reach::Link(token) => Some(token),
            Reach::Owned(_) => None,
        }
    }
}

/// A saved item by name or UUID, then (signed in) one of "my items" by name or UUID, then a
/// pasted link or token.
pub fn resolve(ctx: &Context, reference: &str) -> CliResult<Resolved> {
    let store = ctx.load_store()?;
    if let Some(stored) = store.find(&ctx.host, reference) {
        let token = stored
            .owner_token
            .clone()
            .or_else(|| stored.share_token.clone());
        return Ok(Resolved {
            reach: token.map_or_else(|| Reach::Owned(stored.item_uuid.clone()), Reach::Link),
            stored: Some(stored.clone()),
        });
    }
    if !reference.contains("://") && ctx.session()?.is_some() {
        let mine = ctx.app()?.list_my_items()?;
        let found = mine
            .items
            .iter()
            .find(|summary| summary.item.item_uuid == reference || summary.name == reference);
        if let Some(summary) = found {
            return Ok(Resolved {
                reach: Reach::Owned(summary.item.item_uuid.clone()),
                stored: None,
            });
        }
    }
    let link = parse_link(reference).ok_or(CliError::UnknownItem)?;
    Ok(Resolved {
        stored: store.find_by_token(&ctx.host, &link.token).cloned(),
        reach: Reach::Link(link.token),
    })
}

/// Reads an item with any link, or as its signed-in owner.
pub fn read_item(ctx: &Context, resolved: &Resolved) -> CliResult<AppItemRead> {
    let app = ctx.app()?;
    match resolved.link(&app).read(&AppReadOptions::default())? {
        Conditional::Modified { value, .. } => Ok(value),
        Conditional::NotModified => Err(CliError::Fetch(
            "unexpected 304 without If-None-Match".to_owned(),
        )),
    }
}

/// Reads an item and refuses unless the caller may change it.
fn read_owned(ctx: &Context, reference: &str) -> CliResult<(Resolved, AppItemRead)> {
    let resolved = resolve(ctx, reference)?;
    let read = read_item(ctx, &resolved)?;
    if read.item.role != ROLE_OWNER {
        return Err(CliError::ReadOnly);
    }
    Ok((resolved, read))
}

/// The kind an item's `kind` names on its own; a measurement project needs its series code.
pub fn kind_of_item_kind(kind: &str) -> Option<ItemKind> {
    match kind {
        APP_ITEM_KIND_LINK_COLLECTION => Some(ItemKind::Dashboard),
        APP_ITEM_KIND_MEETING => Some(ItemKind::Meeting),
        APP_ITEM_KIND_MODEL => Some(ItemKind::Model),
        _ => None,
    }
}

/// The item's kind from the read itself, never from the link's path: a project's first series
/// is `estimate`, a counter's is `value`.
pub fn item_kind(read: &AppItemRead) -> ItemKind {
    if let Some(kind) = kind_of_item_kind(&read.item.kind) {
        return kind;
    }
    let series_code = read
        .measurement_project
        .as_ref()
        .and_then(|project| project.series.first())
        .map(|series| series.series_code.as_str());
    if series_code == Some(PROJECT_SERIES_CODE) {
        ItemKind::Project
    } else {
        ItemKind::Counter
    }
}

/// The latest forecast, or `None` when the item has none yet.
pub fn latest_forecast(
    ctx: &Context,
    resolved: &Resolved,
) -> CliResult<Option<MeasurementForecastRun>> {
    let app = ctx.app()?;
    match resolved
        .link(&app)
        .latest_forecast(&AppReadOptions::default())
    {
        Ok(Conditional::Modified { value, .. }) => Ok(Some(value)),
        Ok(Conditional::NotModified) => Ok(None),
        Err(Error::Api(ApiError { status: 404, .. })) => Ok(None),
        Err(error) => Err(error.into()),
    }
}

// ---- Reports ----

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ForecastSummary {
    pub status: String,
    pub method: String,
    pub generated_at: String,
    pub input_count: i64,
    /// Chance of reaching the target by its deadline, 0 to 1.
    pub deadline_probability: Option<f64>,
    pub completion_confidence: Option<f64>,
    pub completion_median: Option<String>,
    pub completion_lower: Option<String>,
    pub completion_upper: Option<String>,
    pub rate_per_day: Option<f64>,
    pub warnings: Vec<String>,
}

impl ForecastSummary {
    pub fn from_run(run: &MeasurementForecastRun) -> Self {
        let counter = run.counter.as_ref();
        let interval = counter.and_then(|c| c.completion_interval.as_ref());
        Self {
            status: run.status.clone(),
            method: run.method.clone(),
            generated_at: run.generated_at.clone(),
            input_count: run.input_count,
            deadline_probability: counter.and_then(|c| c.deadline_probability),
            completion_confidence: interval.map(|i| i.confidence),
            completion_median: run.percentiles.get("p50").cloned(),
            completion_lower: interval.map(|i| i.lower.clone()),
            completion_upper: interval.map(|i| i.upper.clone()),
            rate_per_day: counter.and_then(|c| c.rate.as_ref()).map(|r| r.per_day),
            warnings: run.warnings.iter().map(|w| w.message.clone()).collect(),
        }
    }

    pub fn sentence(&self) -> String {
        let mut text = match (&self.completion_lower, &self.completion_upper) {
            (Some(low), Some(high)) => format!(
                "Done between {} and {} ({:.0}% interval)",
                short_date(low),
                short_date(high),
                self.completion_confidence.unwrap_or(0.9) * 100.0
            ),
            _ => format!(
                "No completion interval yet ({} measurements)",
                self.input_count
            ),
        };
        if let Some(median) = &self.completion_median {
            text.push_str(&format!("; median {}", short_date(median)));
        }
        if let Some(chance) = self.deadline_probability {
            text.push_str(&format!("; {:.0}% chance by the deadline", chance * 100.0));
        }
        if let Some(rate) = self.rate_per_day {
            text.push_str(&format!("; {rate:.2} per day"));
        }
        text
    }
}

fn short_date(text: &str) -> &str {
    text.get(..10).unwrap_or(text)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatedReport {
    pub item_uuid: String,
    pub kind: ItemKind,
    pub name: String,
    pub share_url: Option<String>,
    /// The owner link is saved locally under this name; print it with `share --owner`.
    pub owner_link_saved: bool,
    pub start_measurement_added: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AddReport {
    pub item_uuid: String,
    pub accepted: i64,
    pub rejected: i64,
    pub target_reached: bool,
    pub forecast: Option<ForecastSummary>,
    pub forecast_error: Option<String>,
    pub rows: Vec<AddRow>,
}

impl AddReport {
    pub fn check_outcome(&self) -> CliResult<()> {
        if let Some(error) = &self.forecast_error {
            return Err(CliError::Usage(format!(
                "{} measurement(s) were stored; {} rejected. Forecast refresh failed ({error}); do not add accepted measurements again",
                self.accepted, self.rejected
            )));
        }
        if self.rejected > 0 {
            return Err(CliError::Usage(format!(
                "{} measurement(s) accepted; {} rejected",
                self.accepted, self.rejected
            )));
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AddRow {
    pub row_index: i64,
    pub success: bool,
    pub status: Option<i64>,
    pub observation_uuid: Option<String>,
    pub title: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemReport {
    pub item_uuid: String,
    pub kind: ItemKind,
    pub name: String,
    /// `owner` or `share`: what the presented link may do.
    pub access: String,
    pub status: String,
    pub target_value: Option<f64>,
    pub unit: Option<String>,
    pub deadline: Option<String>,
    pub expires_at: String,
    pub estimates: Vec<EstimateReport>,
    pub entries: Vec<EntryReport>,
    pub forecast: Option<ForecastSummary>,
    pub meeting: Option<MeetingReport>,
}

/// A meeting as it runs; the CLI only reads meetings.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MeetingReport {
    pub status: String,
    pub started_at: Option<String>,
    pub ends_at: Option<String>,
    pub overrun_ms: i64,
    pub blocks: Vec<MeetingBlockReport>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MeetingBlockReport {
    pub title: String,
    pub status: String,
    pub predicted_ms: i64,
    pub actual_ms: i64,
}

impl MeetingReport {
    fn from_meeting(meeting: &AppMeeting) -> Self {
        Self {
            status: meeting.status.clone(),
            started_at: meeting.started_at.clone(),
            ends_at: meeting.ends_at.clone(),
            overrun_ms: meeting.summary.overrun_ms,
            blocks: meeting
                .blocks
                .iter()
                .map(|block| MeetingBlockReport {
                    title: block.title.clone(),
                    status: block.status.clone(),
                    predicted_ms: block.predicted_ms,
                    actual_ms: block.actual_ms,
                })
                .collect(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EstimateReport {
    pub estimated_at: String,
    pub low_date: String,
    pub high_date: String,
    pub note: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EntryReport {
    pub entry_uuid: String,
    pub item_uuid: String,
    pub kind: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListReport {
    /// When signed in, the list holds "my items" as well as the items saved here.
    pub signed_in: bool,
    pub items: Vec<ListedItem>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListedItem {
    pub item_uuid: String,
    /// `None` for one of "my items" not saved here that is a counter or a project: the list
    /// does not say which.
    pub kind: Option<ItemKind>,
    pub name: String,
    pub access: String,
    /// The signed-in user owns it.
    pub mine: bool,
    /// Its links are saved on this machine.
    pub saved_here: bool,
    pub share_url: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShareReport {
    pub share_url: Option<String>,
    /// Present only when asked for with `--owner`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub owner_url: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusReport {
    pub item_uuid: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaimReport {
    pub item_uuid: String,
    pub kind: ItemKind,
    pub name: String,
    /// `yours` once claimed.
    pub ownership: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginReport {
    pub host: String,
    pub expires_at: String,
}

// ---- Counters ----

#[derive(Debug, Clone)]
pub struct CounterDraft {
    pub name: String,
    pub target: f64,
    pub unit: Option<String>,
    pub start: Option<f64>,
    pub started_at: Option<String>,
    pub deadline: Option<String>,
}

pub fn create_counter(ctx: &Context, draft: &CounterDraft) -> CliResult<CreatedReport> {
    let deadline = draft.deadline.as_deref().map(timestamp).transpose()?;
    let started_at = draft.started_at.as_deref().map(timestamp).transpose()?;
    if !draft.target.is_finite() {
        return Err(CliError::Usage("target must be a number".to_owned()));
    }
    let request = AppItemCreate {
        kind: APP_ITEM_KIND_MEASUREMENT_PROJECT.to_owned(),
        measurement_project: Some(counter_project(draft, deadline)),
        ..AppItemCreate::default()
    };
    let created = ctx.app()?.create_item(&request)?;
    let item_uuid = created.item.item.item_uuid.clone();
    save_item(
        ctx,
        &item_uuid,
        ItemKind::Counter,
        &draft.name,
        Some(&created.owner_token),
        Some(&created.share_token),
    )?;
    let mut report = CreatedReport {
        item_uuid: item_uuid.clone(),
        kind: ItemKind::Counter,
        name: draft.name.clone(),
        share_url: Some(item_url(
            &ctx.host,
            ItemKind::Counter,
            Access::Share,
            &created.share_token,
        )),
        owner_link_saved: true,
        start_measurement_added: false,
    };
    if let Some(start) = draft.start {
        let at = started_at.unwrap_or_else(now_rfc3339);
        let owner = Resolved {
            reach: Reach::Link(created.owner_token.clone()),
            stored: None,
        };
        add_rows(ctx, &owner, &created.item, &[(at, start)], None)?.check_outcome()?;
        report.start_measurement_added = true;
    }
    Ok(report)
}

fn counter_project(draft: &CounterDraft, deadline: Option<String>) -> AppMeasurementProjectCreate {
    AppMeasurementProjectCreate {
        kind: COUNTER_PROJECT_KIND.to_owned(),
        name: draft.name.clone(),
        description: None,
        series: vec![MeasurementSeriesCreate {
            series_code: COUNTER_SERIES_CODE.to_owned(),
            name: draft.unit.clone().unwrap_or_else(|| draft.name.clone()),
            unit_slug: UNIT_SLUG.to_owned(),
            completion_direction: COMPLETION_INCREASE.to_owned(),
            source: SOURCE_MANUAL.to_owned(),
        }],
        target: MeasurementTargetCreate {
            target_code: TARGET_CODE.to_owned(),
            name: draft.name.clone(),
            target_value: draft.target,
            target_date: deadline,
            state: TARGET_ACTIVE.to_owned(),
        },
    }
}

fn save_item(
    ctx: &Context,
    item_uuid: &str,
    kind: ItemKind,
    name: &str,
    owner_token: Option<&str>,
    share_token: Option<&str>,
) -> CliResult<()> {
    let mut store = ctx.load_store()?;
    store.upsert(StoredItem {
        host: ctx.host.clone(),
        item_uuid: item_uuid.to_owned(),
        kind,
        name: name.to_owned(),
        owner_token: owner_token.map(str::to_owned),
        share_token: share_token.map(str::to_owned),
        saved_at: now_rfc3339(),
    });
    ctx.save_store(&store)
}

/// Adds measurements as `(RFC 3339 time, value)` rows, then runs the forecast.
pub fn add_measurements(
    ctx: &Context,
    reference: &str,
    rows: &[(String, f64)],
    key: Option<&str>,
) -> CliResult<AddReport> {
    if rows.is_empty() {
        return Err(CliError::Usage("no measurements to add".to_owned()));
    }
    if key.is_some() && rows.len() != 1 {
        return Err(CliError::Usage(
            "one idempotency key identifies one measurement".to_owned(),
        ));
    }
    let (resolved, read) = read_owned(ctx, reference)?;
    if item_kind(&read) != ItemKind::Counter {
        return Err(CliError::WrongKind(
            "measurements go on a counter; a project takes estimates".to_owned(),
        ));
    }
    add_rows(ctx, &resolved, &read, rows, key)
}

fn add_rows(
    ctx: &Context,
    owner: &Resolved,
    read: &AppItemRead,
    rows: &[(String, f64)],
    key: Option<&str>,
) -> CliResult<AddReport> {
    let series_uuid = read
        .measurement_project
        .as_ref()
        .and_then(|project| project.series.first())
        .map(|series| series.series_uuid.clone())
        .ok_or_else(|| CliError::WrongKind("this item has no series to measure".to_owned()))?;
    let request = MeasurementObservationBulk {
        rows: rows
            .iter()
            .map(|(at, value)| MeasurementObservation {
                series_uuid: series_uuid.clone(),
                observed_at: at.clone(),
                value: *value,
                idempotency_key: key.map(str::to_owned),
            })
            .collect(),
    };
    let app = ctx.app()?;
    let link = owner.link(&app);
    let import = link.add_measurements(&request)?;
    let (forecast, forecast_error) = if import.accepted > 0 {
        match refresh_forecast(ctx, owner, read, &link, import.accepted) {
            Ok(forecast) => (forecast.as_ref().map(ForecastSummary::from_run), None),
            Err(error) => (None, Some(error.to_string())),
        }
    } else {
        (None, None)
    };
    Ok(AddReport {
        item_uuid: read.item.item_uuid.clone(),
        accepted: import.accepted,
        rejected: import.rejected,
        target_reached: import.completed_target_uuid.is_some(),
        forecast,
        forecast_error,
        rows: import
            .results
            .into_iter()
            .map(|row| AddRow {
                row_index: row.row_index,
                success: row.success,
                status: row.status,
                observation_uuid: row.observation_uuid,
                title: row.title,
            })
            .collect(),
    })
}

fn refresh_forecast(
    ctx: &Context,
    owner: &Resolved,
    item: &AppItemRead,
    link: &AppLink,
    accepted: i64,
) -> CliResult<Option<MeasurementForecastRun>> {
    let count = read_forecast_story(link)?.map_or(accepted, |story| story.trust.observation_count);
    if count < FORECAST_MIN_MEASUREMENTS {
        return Ok(None);
    }
    let previous = latest_forecast(ctx, owner)?;
    let method = item
        .measurement_project
        .as_ref()
        .and_then(|project| project.run.forecast_method.clone());
    Ok(Some(link.run_forecast(&MeasurementForecastRunRequest {
        method: method.or_else(|| previous.as_ref().map(|run| run.method.clone())),
        forecast_from: previous.and_then(|run| run.forecast_from),
        ..Default::default()
    })?))
}

/// Parses a two-column CSV of ISO timestamp and value; a header row is allowed first.
pub fn parse_csv(text: &str) -> CliResult<Vec<(String, f64)>> {
    let mut rows = Vec::new();
    for (index, line) in text.lines().enumerate() {
        if line.trim().is_empty() {
            continue;
        }
        let cells: Vec<&str> = line
            .split(',')
            .map(|c| c.trim().trim_matches('"'))
            .collect();
        let parsed = match cells.as_slice() {
            [at, value] => {
                parse_rfc3339(at).zip(value.parse::<f64>().ok().filter(|v| v.is_finite()))
            }
            _ => None,
        };
        match parsed {
            Some((at, value)) => rows.push((crate::time::format_rfc3339(at), value)),
            None if index == first_line(text) && cells.as_slice() == ["timestamp", "value"] => {
                continue;
            }
            None => {
                return Err(CliError::Usage(format!(
                    "CSV line {}: expected an ISO timestamp and a number",
                    index + 1
                )));
            }
        }
    }
    Ok(rows)
}

fn first_line(text: &str) -> usize {
    text.lines()
        .position(|line| !line.trim().is_empty())
        .unwrap_or(0)
}

/// An RFC 3339 time or a `YYYY-MM-DD` date, normalised to RFC 3339 UTC.
pub fn timestamp(text: &str) -> CliResult<String> {
    parse_rfc3339(text)
        .map(crate::time::format_rfc3339)
        .ok_or_else(|| {
            CliError::Usage(format!(
                "{text:?} is not a date (YYYY-MM-DD) or RFC 3339 time"
            ))
        })
}

// ---- Reads ----

pub fn read_forecast_story(link: &AppLink) -> CliResult<Option<AppForecastStory>> {
    match link.forecast_story(&AppReadOptions::default()) {
        Ok(Conditional::Modified { value, .. }) => Ok(Some(value)),
        Ok(Conditional::NotModified) => Err(CliError::Fetch(
            "forecast story was not returned".to_owned(),
        )),
        Err(Error::Api(ApiError { status: 404, .. })) => Ok(None),
        Err(error) => Err(error.into()),
    }
}

pub fn show(ctx: &Context, reference: &str) -> CliResult<ItemReport> {
    let resolved = resolve(ctx, reference)?;
    let read = read_item(ctx, &resolved)?;
    let kind = item_kind(&read);
    let forecast = match kind {
        ItemKind::Counter => {
            latest_forecast(ctx, &resolved)?.map(|run| ForecastSummary::from_run(&run))
        }
        _ => None,
    };
    Ok(item_report(&read, kind, resolved.stored.as_ref(), forecast))
}

/// The counter's unit: its series name, when that is not just the counter's name.
pub fn unit_label(project: &custd_sdk::MeasurementProject) -> Option<String> {
    let series = project.series.first()?;
    (series.name != project.name).then(|| series.name.clone())
}

pub fn item_report(
    read: &AppItemRead,
    kind: ItemKind,
    stored: Option<&StoredItem>,
    forecast: Option<ForecastSummary>,
) -> ItemReport {
    let project = read.measurement_project.as_ref();
    let target = project.and_then(|p| p.target.as_ref());
    let meeting = read.meeting.as_ref();
    let name = project
        .map(|p| p.name.clone())
        .or_else(|| meeting.map(|m| m.name.clone()))
        .or_else(|| stored.map(|s| s.name.clone()))
        .unwrap_or_else(|| kind.label().to_owned());
    ItemReport {
        item_uuid: read.item.item_uuid.clone(),
        kind,
        name,
        access: read.item.role.clone(),
        status: project
            .map(|p| p.status.clone())
            .or_else(|| meeting.map(|m| m.status.clone()))
            .unwrap_or_else(|| "active".to_owned()),
        target_value: target.map(|t| t.target_value),
        unit: project.and_then(unit_label),
        deadline: target
            .and_then(|t| t.target_date.clone())
            .or_else(|| project.and_then(|p| p.delivery.target_date.clone())),
        expires_at: read.item.expires_at.clone(),
        estimates: read
            .estimates
            .iter()
            .flat_map(|list| &list.estimates)
            .map(|e| EstimateReport {
                estimated_at: e.estimated_at.clone(),
                low_date: e.low_date.clone(),
                high_date: e.high_date.clone(),
                note: e.note.clone(),
            })
            .collect(),
        entries: read
            .link_collection
            .iter()
            .flat_map(|c| &c.entries)
            .map(|e| EntryReport {
                entry_uuid: e.entry_uuid.clone(),
                item_uuid: e.item_uuid.clone(),
                kind: e.kind.clone(),
            })
            .collect(),
        forecast,
        meeting: meeting.map(MeetingReport::from_meeting),
    }
}

/// The items saved on this machine and, when signed in, "my items" (one call).
pub fn list(ctx: &Context) -> CliResult<ListReport> {
    let store = ctx.load_store()?;
    let mut items: Vec<ListedItem> = store
        .items_on(&ctx.host)
        .map(|item| ListedItem {
            item_uuid: item.item_uuid.clone(),
            kind: Some(item.kind),
            name: item.name.clone(),
            access: if item.owner_token.is_some() {
                ROLE_OWNER
            } else {
                ROLE_SHARE
            }
            .to_owned(),
            mine: false,
            saved_here: true,
            share_url: item
                .share_token
                .as_deref()
                .map(|token| item_url(&ctx.host, item.kind, Access::Share, token)),
        })
        .collect();
    let signed_in = ctx.session()?.is_some();
    if signed_in {
        for summary in ctx.app()?.list_my_items()?.items {
            let uuid = &summary.item.item_uuid;
            if let Some(known) = items.iter_mut().find(|item| &item.item_uuid == uuid) {
                known.mine = true;
                known.access = ROLE_OWNER.to_owned();
                continue;
            }
            let kind = kind_of_item_kind(&summary.item.kind);
            items.push(ListedItem {
                item_uuid: uuid.clone(),
                kind,
                name: match summary.name.as_str() {
                    "" => kind.map_or("item", ItemKind::label).to_owned(),
                    name => name.to_owned(),
                },
                access: summary.item.role.clone(),
                mine: true,
                saved_here: false,
                share_url: None,
            });
        }
    }
    Ok(ListReport { signed_in, items })
}

/// Saves an owner's existing capability on this device without taking account ownership.
pub fn remember(ctx: &Context, reference: &str) -> CliResult<ItemReport> {
    let (resolved, read) = read_owned(ctx, reference)?;
    let token = resolved
        .token()
        .ok_or_else(|| CliError::Usage("give an owner link".to_owned()))?;
    let item = item_report(&read, item_kind(&read), resolved.stored.as_ref(), None);
    let share_token = resolved
        .stored
        .as_ref()
        .and_then(|stored| stored.share_token.as_deref());
    save_item(
        ctx,
        &item.item_uuid,
        item.kind,
        &item.name,
        Some(token),
        share_token,
    )?;
    Ok(item)
}

/// Makes the signed-in user the owner of the item an owner link opens, and saves it here.
pub fn claim(ctx: &Context, reference: &str) -> CliResult<ClaimReport> {
    if ctx.session()?.is_none() {
        return Err(CliError::Usage(
            "sign in first with `done-when login`; claiming makes the item yours".to_owned(),
        ));
    }
    let (resolved, _) = read_owned(ctx, reference)?;
    let Some(owner_token) = resolved.token() else {
        return Err(CliError::Usage("that item is already yours".to_owned()));
    };
    let app = ctx.app()?;
    let read = match resolved.link(&app).claim() {
        Err(Error::Api(error)) if error.code() == Some(CLAIMED_BY_SOMEONE_ELSE) => {
            return Err(CliError::Usage(
                "someone else has already claimed that item".to_owned(),
            ));
        }
        other => other?,
    };
    let kind = item_kind(&read);
    let report = item_report(&read, kind, resolved.stored.as_ref(), None);
    let share_token = resolved.stored.as_ref().and_then(|s| s.share_token.clone());
    save_item(
        ctx,
        &report.item_uuid,
        kind,
        &report.name,
        Some(owner_token),
        share_token.as_deref(),
    )?;
    Ok(ClaimReport {
        item_uuid: report.item_uuid,
        kind,
        name: report.name,
        ownership: read.item.ownership,
    })
}

pub fn share(ctx: &Context, reference: &str, with_owner: bool) -> CliResult<ShareReport> {
    let resolved = resolve(ctx, reference)?;
    let (kind, share_token, owner_token) = match &resolved.stored {
        Some(item) => (
            item.kind,
            item.share_token.clone(),
            item.owner_token.clone(),
        ),
        None => {
            let read = read_item(ctx, &resolved)?;
            let kind = item_kind(&read);
            let token = resolved.token().map(str::to_owned);
            match read.item.role.as_str() {
                ROLE_OWNER => (kind, None, token),
                _ => (kind, token, None),
            }
        }
    };
    if with_owner && owner_token.is_none() {
        return Err(match resolved.reach {
            Reach::Owned(_) => CliError::Usage(
                "no owner link for that item is saved here; it is yours, so commands reach it without one".to_owned(),
            ),
            Reach::Link(_) => CliError::ReadOnly,
        });
    }
    Ok(ShareReport {
        share_url: share_token.map(|t| item_url(&ctx.host, kind, Access::Share, &t)),
        owner_url: owner_token
            .filter(|_| with_owner)
            .map(|t| item_url(&ctx.host, kind, Access::Owner, &t)),
    })
}

/// The share-card image URL, when a share link is known.
pub fn card_link(ctx: &Context, resolved: &Resolved, kind: ItemKind, role: &str) -> Option<String> {
    let share = match &resolved.stored {
        Some(item) => item.share_token.clone(),
        None if role != ROLE_OWNER => resolved.token().map(str::to_owned),
        None => None,
    };
    share.and_then(|token| card_url(&ctx.host, kind, &token))
}

// ---- Projects ----

pub fn estimate(
    ctx: &Context,
    reference: &str,
    low: &str,
    high: &str,
    note: Option<String>,
    at: Option<&str>,
) -> CliResult<EstimateReport> {
    let (resolved, _) = read_owned(ctx, reference)?;
    let request = ProjectEstimateCreate {
        estimated_at: at.map(timestamp).transpose()?,
        low_date: timestamp(low)?,
        high_date: timestamp(high)?,
        note,
    };
    let app = ctx.app()?;
    let estimate = resolved.link(&app).create_estimate(&request)?;
    Ok(EstimateReport {
        estimated_at: estimate.estimated_at,
        low_date: estimate.low_date,
        high_date: estimate.high_date,
        note: estimate.note,
    })
}

pub fn complete(ctx: &Context, reference: &str, at: Option<&str>) -> CliResult<StatusReport> {
    let (resolved, read) = read_owned(ctx, reference)?;
    let kind = item_kind(&read);
    if !matches!(kind, ItemKind::Counter | ItemKind::Project) {
        return Err(CliError::WrongKind(format!(
            "a {} cannot be completed",
            kind.label()
        )));
    }
    let completed_at = at.map(timestamp).transpose()?.unwrap_or_else(now_rfc3339);
    let app = ctx.app()?;
    let read = resolved
        .link(&app)
        .complete(&ProjectComplete { completed_at })?;
    Ok(StatusReport {
        item_uuid: read.item.item_uuid,
        status: read
            .measurement_project
            .map_or_else(|| "completed".to_owned(), |p| p.status),
    })
}

// ---- Dashboards ----

pub fn create_dashboard(ctx: &Context, name: &str) -> CliResult<CreatedReport> {
    let request = AppItemCreate {
        kind: APP_ITEM_KIND_LINK_COLLECTION.to_owned(),
        ..AppItemCreate::default()
    };
    let created = ctx.app()?.create_item(&request)?;
    let item_uuid = created.item.item.item_uuid.clone();
    save_item(
        ctx,
        &item_uuid,
        ItemKind::Dashboard,
        name,
        Some(&created.owner_token),
        Some(&created.share_token),
    )?;
    Ok(CreatedReport {
        item_uuid,
        kind: ItemKind::Dashboard,
        name: name.to_owned(),
        share_url: Some(item_url(
            &ctx.host,
            ItemKind::Dashboard,
            Access::Share,
            &created.share_token,
        )),
        owner_link_saved: true,
        start_measurement_added: false,
    })
}

/// Adds an item to a dashboard by its share link (a saved item's share link is used).
pub fn dashboard_add(ctx: &Context, dashboard: &str, item: &str) -> CliResult<EntryReport> {
    let (board, read) = read_owned(ctx, dashboard)?;
    require_dashboard(&read)?;
    let entry_item = resolve(ctx, item)?;
    let token = entry_item
        .stored
        .as_ref()
        .and_then(|stored| stored.share_token.clone())
        .or_else(|| entry_item.token().map(str::to_owned))
        .ok_or_else(|| {
            CliError::Usage("add that item by its share link; none is saved here".to_owned())
        })?;
    let app = ctx.app()?;
    let entry = board.link(&app).add_entry(&token)?;
    Ok(EntryReport {
        entry_uuid: entry.entry_uuid,
        item_uuid: entry.item_uuid,
        kind: entry.kind,
    })
}

/// Removes a dashboard entry, named by its entry UUID or its item's UUID.
pub fn dashboard_remove(ctx: &Context, dashboard: &str, entry: &str) -> CliResult<EntryReport> {
    let (board, read) = read_owned(ctx, dashboard)?;
    require_dashboard(&read)?;
    let found = read
        .link_collection
        .iter()
        .flat_map(|c| &c.entries)
        .find(|e| e.entry_uuid == entry || e.item_uuid == entry)
        .ok_or_else(|| {
            CliError::Usage("that dashboard has no such entry; see `show`".to_owned())
        })?;
    let app = ctx.app()?;
    board.link(&app).remove_entry(&found.entry_uuid)?;
    Ok(EntryReport {
        entry_uuid: found.entry_uuid.clone(),
        item_uuid: found.item_uuid.clone(),
        kind: found.kind.clone(),
    })
}

fn require_dashboard(read: &AppItemRead) -> CliResult<()> {
    if read.item.kind == APP_ITEM_KIND_LINK_COLLECTION {
        Ok(())
    } else {
        Err(CliError::WrongKind(
            "that item is not a dashboard".to_owned(),
        ))
    }
}

// ---- Sign-in ----

pub fn login(ctx: &Context, prompt: &mut dyn std::io::Write) -> CliResult<LoginReport> {
    let sign_in = ctx
        .discovery()?
        .sign_in
        .as_ref()
        .ok_or_else(|| CliError::Usage(format!("{} does not offer sign-in", ctx.host)))?;
    let scopes = SIGN_IN_SCOPES
        .iter()
        .map(|scope| (*scope).to_owned())
        .collect();
    let token = (ctx.login_runner)(sign_in, scopes, prompt)?;
    let expires_at = now_seconds() + token.expires_in.as_secs() as i64;
    let mut store = ctx.load_store()?;
    store.set_session(StoredSession {
        host: ctx.host.clone(),
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        expires_at,
    });
    ctx.save_store(&store)?;
    Ok(LoginReport {
        host: ctx.host.clone(),
        expires_at: crate::time::format_rfc3339(expires_at),
    })
}
