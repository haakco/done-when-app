//! `watch`: a live terminal view of a counter. It polls with `If-None-Match`, so an unchanged
//! item costs a 304; errors back off up to a minute and say so on screen.

use std::time::{Duration, Instant};

use custd_sdk::{AppItemRead, AppReadOptions, Conditional, MeasurementForecastRun};
use ratatui::Frame;
use ratatui::crossterm::event::{self, Event, KeyCode, KeyEventKind};
use ratatui::layout::{Constraint, Layout, Rect};
use ratatui::style::{Color, Style, Stylize};
use ratatui::symbols::Marker;
use ratatui::text::Line;
use ratatui::widgets::{
    Axis, Block, Chart, Dataset, Gauge, GraphType, List, ListItem, Paragraph, Wrap,
};
use ratatui_image::StatefulImage;
use ratatui_image::picker::{Picker, ProtocolType};
use ratatui_image::protocol::StatefulProtocol;

use crate::context::{Context, fetch_card};
use crate::error::CliResult;
use crate::links::ItemKind;
use crate::ops::{self, ForecastSummary};
use crate::store::RecentMeasurement;
use crate::time::{format_date, format_rfc3339, now_seconds, parse_rfc3339};

const MAX_BACKOFF: Duration = Duration::from_secs(60);
const KEY_WAIT: Duration = Duration::from_millis(250);

/// Everything one frame draws.
#[derive(Default)]
pub struct WatchModel {
    pub name: String,
    pub unit: String,
    pub target: Option<f64>,
    pub deadline: Option<String>,
    pub forecast: Option<MeasurementForecastRun>,
    pub recent: Vec<RecentMeasurement>,
    pub status: String,
    /// The share-card URL, shown as text when the image cannot be drawn.
    pub card_url: Option<String>,
}

impl WatchModel {
    pub fn apply_item(&mut self, read: &AppItemRead) {
        if let Some(project) = &read.measurement_project {
            self.name = project.name.clone();
            self.unit = ops::unit_label(project).unwrap_or_default();
            self.target = project.target.as_ref().map(|t| t.target_value);
            self.deadline = project.target.as_ref().and_then(|t| t.target_date.clone());
        }
    }
}

/// Polling state: the last ETags, whether paused, and the error backoff.
pub struct Poller {
    interval: Duration,
    backoff: Option<Duration>,
    item_etag: Option<String>,
    forecast_etag: Option<String>,
    pub paused: bool,
    next_at: Instant,
}

impl Poller {
    pub fn new(interval: Duration) -> Self {
        Self {
            interval,
            backoff: None,
            item_etag: None,
            forecast_etag: None,
            paused: false,
            next_at: Instant::now(),
        }
    }

    pub fn due(&self) -> bool {
        !self.paused && Instant::now() >= self.next_at
    }

    /// One refresh: reads the item and its latest forecast conditionally.
    pub fn poll(&mut self, ctx: &Context, token: &str, model: &mut WatchModel) {
        match self.refresh(ctx, token, model) {
            Ok(()) => {
                self.backoff = None;
                self.next_at = Instant::now() + self.interval;
                model.status = format!(
                    "Updated {} · every {}s · p pause · r refresh · q quit",
                    &format_rfc3339(now_seconds())[11..19],
                    self.interval.as_secs()
                );
            }
            Err(error) => {
                let wait = self
                    .backoff
                    .map_or(self.interval * 2, |b| b * 2)
                    .min(MAX_BACKOFF);
                self.backoff = Some(wait);
                self.next_at = Instant::now() + wait;
                model.status = format!("{error} · retrying in {}s · q quit", wait.as_secs());
            }
        }
    }

    fn refresh(&mut self, ctx: &Context, token: &str, model: &mut WatchModel) -> CliResult<()> {
        let link = ctx.app()?.link(token);
        let options = AppReadOptions {
            item: None,
            if_none_match: self.item_etag.clone(),
        };
        if let Conditional::Modified { etag, value } = link.read(&options)? {
            self.item_etag = etag;
            model.apply_item(&value);
        }
        let options = AppReadOptions {
            item: None,
            if_none_match: self.forecast_etag.clone(),
        };
        match link.latest_forecast(&options) {
            Ok(Conditional::Modified { etag, value }) => {
                self.forecast_etag = etag;
                model.forecast = Some(value);
            }
            Ok(Conditional::NotModified) => {}
            // No forecast yet is an empty state, not an error.
            Err(custd_sdk::Error::Api(custd_sdk::ApiError { status: 404, .. })) => {
                model.forecast = None
            }
            Err(error) => return Err(error.into()),
        }
        let store = ctx.load_store()?;
        if let Some(item) = store.find_by_token(&ctx.host, token) {
            model.recent = item.recent.clone();
        }
        Ok(())
    }

    pub fn refresh_now(&mut self) {
        self.next_at = Instant::now();
    }
}

pub fn run(ctx: &Context, reference: &str, interval: Duration, images: bool) -> CliResult<()> {
    let resolved = ops::resolve(ctx, reference)?;
    let read = ops::read_item(ctx, &resolved.token)?;
    let kind = ops::item_kind(&read, resolved.kind);
    if kind != ItemKind::Counter {
        return Err(crate::error::CliError::WrongKind(
            "watch shows a counter".to_owned(),
        ));
    }
    let mut model = WatchModel {
        card_url: ops::card_link(ctx, &resolved, kind, &read.item.role),
        ..WatchModel::default()
    };
    model.apply_item(&read);
    let mut terminal = ratatui::try_init()?;
    let mut card = if images {
        load_card(model.card_url.as_deref())
    } else {
        None
    };
    let result = event_loop(
        ctx,
        &resolved.token,
        interval,
        &mut terminal,
        &mut model,
        &mut card,
    );
    ratatui::restore();
    result
}

fn event_loop(
    ctx: &Context,
    token: &str,
    interval: Duration,
    terminal: &mut ratatui::DefaultTerminal,
    model: &mut WatchModel,
    card: &mut Option<StatefulProtocol>,
) -> CliResult<()> {
    let mut poller = Poller::new(interval);
    loop {
        if poller.due() {
            poller.poll(ctx, token, model);
        }
        terminal.draw(|frame| render(frame, model, card.as_mut()))?;
        if !event::poll(KEY_WAIT)? {
            continue;
        }
        let Event::Key(key) = event::read()? else {
            continue;
        };
        if key.kind != KeyEventKind::Press {
            continue;
        }
        match key.code {
            KeyCode::Char('q') | KeyCode::Esc => return Ok(()),
            KeyCode::Char('p') => {
                poller.paused = !poller.paused;
                if poller.paused {
                    model.status = "Paused · p resume · q quit".to_owned();
                } else {
                    poller.refresh_now();
                }
            }
            KeyCode::Char('r') => poller.refresh_now(),
            _ => {}
        }
    }
}

/// The share card through a graphics protocol, or `None` for the text fallback.
fn load_card(url: Option<&str>) -> Option<StatefulProtocol> {
    let picker = Picker::from_query_stdio().ok()?;
    if picker.protocol_type() == ProtocolType::Halfblocks {
        return None;
    }
    card_protocol(&picker, &fetch_card(url?).ok()?)
}

pub fn card_protocol(picker: &Picker, png: &[u8]) -> Option<StatefulProtocol> {
    let image = image::load_from_memory_with_format(png, image::ImageFormat::Png).ok()?;
    Some(picker.new_resize_protocol(image))
}

pub fn render(frame: &mut Frame, model: &WatchModel, card: Option<&mut StatefulProtocol>) {
    let [title, body, status] = Layout::vertical([
        Constraint::Length(1),
        Constraint::Min(8),
        Constraint::Length(1),
    ])
    .areas(frame.area());
    frame.render_widget(Line::from(model.name.clone()).bold(), title);
    let [left, right] =
        Layout::horizontal([Constraint::Percentage(65), Constraint::Percentage(35)]).areas(body);
    let [chart_area, gauge_area, sentence_area] = Layout::vertical([
        Constraint::Min(6),
        Constraint::Length(3),
        Constraint::Length(2),
    ])
    .areas(left);
    render_chart(frame, model, chart_area);
    render_gauge(frame, model, gauge_area);
    let sentence = model.forecast.as_ref().map_or_else(
        || "No forecast yet: add a few measurements.".to_owned(),
        |run| ForecastSummary::from_run(run).sentence(),
    );
    frame.render_widget(
        Paragraph::new(sentence).wrap(Wrap { trim: true }),
        sentence_area,
    );
    let [card_area, recent_area] =
        Layout::vertical([Constraint::Percentage(50), Constraint::Percentage(50)]).areas(right);
    render_card(frame, model, card, card_area);
    render_recent(frame, model, recent_area);
    frame.render_widget(Line::from(model.status.clone()).dim(), status);
}

/// Chart points `(Unix seconds, value)` of the forecast's median and its 90% band.
#[derive(Debug, Default)]
pub struct ForecastBand {
    pub low: Vec<(f64, f64)>,
    pub median: Vec<(f64, f64)>,
    pub high: Vec<(f64, f64)>,
}

/// The median and 90% band of the posterior lines, point by point.
pub fn forecast_band(run: &MeasurementForecastRun) -> ForecastBand {
    let lines = run
        .counter
        .as_ref()
        .map(|c| c.detail.posterior_lines.as_slice())
        .unwrap_or_default();
    let mut band = ForecastBand::default();
    let Some(first) = lines.first() else {
        return band;
    };
    for (index, point) in first.points.iter().enumerate() {
        let Some(at) = parse_rfc3339(&point.at) else {
            continue;
        };
        let mut values: Vec<f64> = lines
            .iter()
            .filter_map(|l| l.points.get(index))
            .map(|p| p.value)
            .collect();
        values.sort_by(f64::total_cmp);
        let x = at as f64;
        band.low.push((x, quantile(&values, 0.05)));
        band.median.push((x, quantile(&values, 0.5)));
        band.high.push((x, quantile(&values, 0.95)));
    }
    band
}

fn quantile(sorted: &[f64], q: f64) -> f64 {
    let index = ((sorted.len() - 1) as f64 * q).round() as usize;
    sorted[index]
}

fn render_chart(frame: &mut Frame, model: &WatchModel, area: Rect) {
    let measured: Vec<(f64, f64)> = model
        .recent
        .iter()
        .filter_map(|m| parse_rfc3339(&m.at).map(|at| (at as f64, m.value)))
        .collect();
    let band = model
        .forecast
        .as_ref()
        .map(forecast_band)
        .unwrap_or_default();
    let all: Vec<&(f64, f64)> = measured
        .iter()
        .chain(&band.low)
        .chain(&band.median)
        .chain(&band.high)
        .collect();
    let (x_min, x_max) = bounds(all.iter().map(|p| p.0), now_seconds() as f64);
    let (y_min, y_max) = bounds(all.iter().map(|p| p.1).chain(model.target), 0.0);
    let target_line: Vec<(f64, f64)> = model
        .target
        .map(|t| vec![(x_min, t), (x_max, t)])
        .unwrap_or_default();
    let datasets = vec![
        dataset("90% band", &band.low, Color::DarkGray, GraphType::Line),
        dataset("", &band.high, Color::DarkGray, GraphType::Line),
        dataset("forecast", &band.median, Color::Cyan, GraphType::Line),
        dataset("target", &target_line, Color::Red, GraphType::Line),
        dataset("measured", &measured, Color::Yellow, GraphType::Scatter),
    ];
    let chart = Chart::new(datasets)
        .block(Block::bordered().title("Forecast"))
        .x_axis(
            Axis::default()
                .bounds([x_min, x_max])
                .labels([format_date(x_min as i64), format_date(x_max as i64)]),
        )
        .y_axis(
            Axis::default()
                .bounds([y_min, y_max])
                .labels([format!("{y_min:.0}"), format!("{y_max:.0} {}", model.unit)]),
        );
    frame.render_widget(chart, area);
}

fn dataset<'a>(
    name: &'a str,
    data: &'a [(f64, f64)],
    color: Color,
    kind: GraphType,
) -> Dataset<'a> {
    let dataset = Dataset::default().data(data);
    let dataset = if name.is_empty() {
        dataset
    } else {
        dataset.name(name)
    };
    dataset
        .marker(Marker::Braille)
        .graph_type(kind)
        .style(Style::default().fg(color))
}

fn bounds(values: impl Iterator<Item = f64>, fallback: f64) -> (f64, f64) {
    let (min, max) = values.fold((f64::INFINITY, f64::NEG_INFINITY), |(lo, hi), v| {
        (lo.min(v), hi.max(v))
    });
    if min.is_finite() && max > min {
        (min, max)
    } else {
        (fallback - 1.0, fallback + 1.0)
    }
}

fn render_gauge(frame: &mut Frame, model: &WatchModel, area: Rect) {
    let chance = model
        .forecast
        .as_ref()
        .and_then(|run| run.counter.as_ref())
        .and_then(|c| c.deadline_probability);
    let block = Block::bordered().title("Chance by the deadline");
    let gauge = match (chance, &model.deadline) {
        (Some(chance), deadline) => Gauge::default()
            .ratio(chance.clamp(0.0, 1.0))
            .label(format!(
                "{:.0}% by {}",
                chance * 100.0,
                deadline
                    .as_deref()
                    .map_or("the deadline", |d| d.get(..10).unwrap_or(d))
            )),
        (None, Some(_)) => Gauge::default().ratio(0.0).label("not forecast yet"),
        (None, None) => Gauge::default().ratio(0.0).label("no deadline set"),
    };
    frame.render_widget(
        gauge
            .block(block)
            .gauge_style(Style::default().fg(Color::Cyan)),
        area,
    );
}

fn render_card(
    frame: &mut Frame,
    model: &WatchModel,
    card: Option<&mut StatefulProtocol>,
    area: Rect,
) {
    let block = Block::bordered().title("Share card");
    let inner = block.inner(area);
    frame.render_widget(block, area);
    match card {
        Some(state) => frame.render_stateful_widget(StatefulImage::default(), inner, state),
        None => {
            let text = match &model.card_url {
                Some(url) => format!("This terminal cannot show images. Card: {url}"),
                None => "No share link is saved here, so there is no card to show.".to_owned(),
            };
            frame.render_widget(Paragraph::new(text).wrap(Wrap { trim: true }), inner);
        }
    }
}

fn render_recent(frame: &mut Frame, model: &WatchModel, area: Rect) {
    let items: Vec<ListItem> = model
        .recent
        .iter()
        .rev()
        .map(|m| {
            ListItem::new(format!(
                "{}  {}",
                m.at.get(..16).unwrap_or(&m.at).replace('T', " "),
                m.value
            ))
        })
        .collect();
    let block = Block::bordered().title("Added from here");
    if items.is_empty() {
        frame.render_widget(
            Paragraph::new("None yet. `done-when add` records one.").block(block),
            area,
        );
    } else {
        frame.render_widget(List::new(items).block(block), area);
    }
}
