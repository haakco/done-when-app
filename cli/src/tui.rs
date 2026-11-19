//! Browse and write through the same operations as the command line.
use ratatui::Frame;
use ratatui::crossterm::event::{self, Event, KeyCode, KeyEventKind, KeyModifiers};
use ratatui::layout::{Constraint, Layout};
use ratatui::widgets::{Block, List, Paragraph, Wrap};

use crate::context::Context;
use crate::error::{CliError, CliResult};
use crate::links::ItemKind;
use crate::ops::{self, ItemReport, ListedItem};
use crate::report::Report;
use crate::time::now_rfc3339;

#[derive(Default)]
struct View {
    items: Vec<ListedItem>,
    selected: usize,
    detail: Option<ItemReport>,
    input: Option<String>,
    progress: Option<String>,
    loading: bool,
    status: String,
}

impl View {
    fn reload(&mut self, ctx: &Context) {
        match ops::list(ctx) {
            Ok(list) => {
                self.items = list
                    .items
                    .into_iter()
                    .filter(|item| {
                        matches!(
                            item.kind,
                            Some(ItemKind::Counter | ItemKind::Project) | None
                        )
                    })
                    .collect();
                self.selected = self.selected.min(self.items.len().saturating_sub(1));
                self.status.clear();
            }
            Err(error) => self.status = format!("Items could not be loaded: {error}"),
        }
    }

    fn open(&mut self, ctx: &Context, reference: &str) {
        match ops::show(ctx, reference) {
            Ok(item) => {
                self.progress = None;
                self.status.clear();
                if item.kind == ItemKind::Counter {
                    match counter_progress(ctx, reference, &item) {
                        Ok(progress) => self.progress = progress,
                        Err(error) => {
                            self.status = format!("Progress could not be loaded: {error}")
                        }
                    }
                }
                self.detail = Some(item);
            }
            Err(error) => self.status = format!("Item could not be loaded: {error}"),
        }
    }

    fn write(&mut self, ctx: &Context, input: &str) {
        let Some(item) = &self.detail else { return };
        let reference = item.item_uuid.clone();
        let result = match item.kind {
            ItemKind::Counter => write_measurement(ctx, &reference, input),
            ItemKind::Project => write_estimate(ctx, &reference, input),
            _ => return,
        };
        match result {
            Ok(()) => {
                self.open(ctx, &reference);
                if self.status.is_empty() {
                    self.status = "Saved.".to_owned();
                }
            }
            Err(error) => self.status = error.to_string(),
        }
    }
}

fn counter_progress(
    ctx: &Context,
    reference: &str,
    item: &ItemReport,
) -> CliResult<Option<String>> {
    let resolved = ops::resolve(ctx, reference)?;
    let app = ctx.app()?;
    let Some(story) = ops::read_forecast_story(&resolved.link(&app))? else {
        return Ok(None);
    };
    let latest = story
        .observations
        .iter()
        .max_by(|left, right| left.observed_at.cmp(&right.observed_at));
    let Some(latest) = latest else {
        return Ok(Some("No measurements yet".to_owned()));
    };
    let progress = match item.target_value {
        Some(target) => format!("{} / {target}", latest.value),
        None => latest.value.to_string(),
    };
    let unit = item.unit.as_deref().unwrap_or("");
    Ok(Some(
        format!("Progress: {progress} {unit}").trim_end().to_owned(),
    ))
}

fn write_measurement(ctx: &Context, reference: &str, input: &str) -> CliResult<()> {
    let value = input
        .trim()
        .parse::<f64>()
        .ok()
        .filter(|value| value.is_finite())
        .ok_or_else(|| CliError::Usage("Enter a valid number.".to_owned()))?;
    ops::add_measurements(ctx, reference, &[(now_rfc3339(), value)], None)?.check_outcome()
}

fn write_estimate(ctx: &Context, reference: &str, input: &str) -> CliResult<()> {
    let dates: Vec<_> = input.split_whitespace().collect();
    let [low, high] = dates.as_slice() else {
        return Err(CliError::Usage(
            "Enter an earliest and latest date (YYYY-MM-DD).".to_owned(),
        ));
    };
    ops::estimate(ctx, reference, low, high, None, None)?;
    Ok(())
}

pub fn run(ctx: &Context) -> CliResult<()> {
    let mut terminal = ratatui::try_init()?;
    let result = run_loop(ctx, &mut terminal);
    ratatui::restore();
    result
}

fn run_loop(ctx: &Context, terminal: &mut ratatui::DefaultTerminal) -> CliResult<()> {
    let mut view = View {
        loading: true,
        ..View::default()
    };
    terminal.draw(|frame| render(frame, &view))?;
    view.reload(ctx);
    view.loading = false;
    loop {
        terminal.draw(|frame| render(frame, &view))?;
        let Event::Key(key) = event::read()? else {
            continue;
        };
        if key.kind != KeyEventKind::Press {
            continue;
        }
        if key.code == KeyCode::Char('c') && key.modifiers.contains(KeyModifiers::CONTROL) {
            return Ok(());
        }
        if let Some(input) = &mut view.input {
            match key.code {
                KeyCode::Esc => view.input = None,
                KeyCode::Enter => {
                    let value = std::mem::take(input);
                    view.input = None;
                    view.write(ctx, &value);
                }
                KeyCode::Backspace => {
                    input.pop();
                }
                KeyCode::Char(ch) if !ch.is_control() && input.len() < 128 => input.push(ch),
                _ => {}
            }
            continue;
        }
        match key.code {
            KeyCode::Char('q') => return Ok(()),
            KeyCode::Esc if view.detail.is_some() => {
                view.detail = None;
                view.status.clear();
            }
            KeyCode::Esc => return Ok(()),
            KeyCode::Char('r') => {
                if let Some(item) = &view.detail {
                    let reference = item.item_uuid.clone();
                    view.open(ctx, &reference);
                } else {
                    view.reload(ctx);
                }
            }
            KeyCode::Char('a') if view.detail.as_ref().is_some_and(editable) => {
                view.input = Some(String::new());
                view.status.clear();
            }
            KeyCode::Up if view.detail.is_none() => view.selected = view.selected.saturating_sub(1),
            KeyCode::Down if view.detail.is_none() => {
                view.selected = (view.selected + 1).min(view.items.len().saturating_sub(1));
            }
            KeyCode::Enter if view.detail.is_none() => {
                if let Some(item) = view.items.get(view.selected) {
                    let reference = item.item_uuid.clone();
                    view.open(ctx, &reference);
                }
            }
            _ => {}
        }
    }
}

fn editable(item: &ItemReport) -> bool {
    item.access == "owner" && matches!(item.kind, ItemKind::Counter | ItemKind::Project)
}

fn render(frame: &mut Frame, view: &View) {
    let [body, help] =
        Layout::vertical([Constraint::Min(1), Constraint::Length(3)]).areas(frame.area());
    let heading = Block::bordered().title("Done When");
    let controls = if let Some(item) = &view.detail {
        let mut text = item.text();
        if let Some(progress) = &view.progress {
            text = format!("{progress}\n{text}");
        }
        frame.render_widget(
            Paragraph::new(text)
                .block(heading)
                .wrap(Wrap { trim: true }),
            body,
        );
        if editable(item) {
            "a Add · r Refresh · Esc Back · q Quit"
        } else {
            "Read only · r Refresh · Esc Back · q Quit"
        }
    } else {
        if view.loading {
            frame.render_widget(Paragraph::new("Loading items…").block(heading), body);
        } else if view.items.is_empty() {
            frame.render_widget(
                Paragraph::new("No saved items. Sign in or create a counter in the CLI.")
                    .block(heading)
                    .wrap(Wrap { trim: true }),
                body,
            );
        } else {
            let rows = usize::from(body.height.saturating_sub(2)).max(1);
            let offset = view.selected.saturating_sub(rows - 1);
            let entries =
                view.items
                    .iter()
                    .enumerate()
                    .skip(offset)
                    .take(rows)
                    .map(|(index, item)| {
                        let marker = if index == view.selected { ">" } else { " " };
                        format!("{marker} {} ({})", item.name, item.access)
                    });
            frame.render_widget(List::new(entries).block(heading), body);
        }
        "↑/↓ Select · Enter Open · r Refresh · q Quit"
    };
    let footer = match (&view.detail, &view.input) {
        (Some(item), Some(input)) => {
            let prompt = if item.kind == ItemKind::Counter {
                "Measurement value"
            } else {
                "Earliest and latest (YYYY-MM-DD)"
            };
            format!("{prompt}: {input}\nEnter Save · Esc Cancel")
        }
        _ if view.status.is_empty() => controls.to_owned(),
        _ => format!("{}\n{controls}", view.status),
    };
    frame.render_widget(Paragraph::new(footer).wrap(Wrap { trim: true }), help);
}
