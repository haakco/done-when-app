//! The command line: parsing and dispatch.

use std::io::{BufRead, Write};
use std::path::PathBuf;
use std::time::Duration;

use clap::{Args, Parser, Subcommand};

use crate::context::Context;
use crate::error::{CliError, CliResult};
use crate::ops::{self, CounterDraft};
use crate::report::Report;

#[derive(Debug, Parser)]
#[command(
    name = "done-when",
    version,
    about = "Track counters and see when they will be done."
)]
pub struct Cli {
    /// The Done When site to talk to.
    #[arg(long, global = true, env = "DONE_WHEN_HOST", default_value = crate::context::DEFAULT_HOST)]
    pub host: String,
    /// Print the result as JSON for scripts.
    #[arg(long, global = true)]
    pub json: bool,
    #[command(subcommand)]
    pub command: Command,
}

#[derive(Debug, Subcommand)]
pub enum Command {
    /// Sign in with a code shown here and approved in a browser.
    Login,
    /// Start a new item.
    #[command(subcommand)]
    New(NewCommand),
    /// Add a measurement to a counter, or many from a CSV file (timestamp,value).
    Add(AddArgs),
    /// Show an item and its forecast.
    Show(ItemArg),
    /// List items saved on this machine.
    List,
    /// Record a dated low/high estimate on a project.
    Estimate(EstimateArgs),
    /// Complete a project on its actual date (default now).
    Complete(CompleteArgs),
    /// Print an item's share link (and its owner link with --owner).
    Share(ShareArgs),
    /// Make and edit dashboards.
    #[command(subcommand)]
    Dashboard(DashboardCommand),
    /// Open a live view of a counter's forecast.
    Watch(WatchArgs),
    /// Run a stdio MCP server for AI agents.
    Mcp,
}

#[derive(Debug, Subcommand)]
pub enum NewCommand {
    /// A number counted from a start value to a target.
    Counter(CounterArgs),
}

#[derive(Debug, Args)]
pub struct CounterArgs {
    #[arg(long)]
    pub name: String,
    #[arg(long)]
    pub target: f64,
    /// The unit, for example `pages`.
    #[arg(long)]
    pub unit: Option<String>,
    /// The value now (or at --started).
    #[arg(long)]
    pub start: Option<f64>,
    /// When the start value was true (RFC 3339 or YYYY-MM-DD).
    #[arg(long, requires = "start")]
    pub started: Option<String>,
    /// The date the target should be reached by.
    #[arg(long)]
    pub deadline: Option<String>,
}

#[derive(Debug, Args)]
pub struct ItemArg {
    /// A saved item's name or UUID, or a share or owner link.
    pub item: String,
}

#[derive(Debug, Args)]
pub struct AddArgs {
    pub item: String,
    #[arg(required_unless_present = "csv", conflicts_with = "csv")]
    pub value: Option<f64>,
    /// When the value was measured (default now).
    #[arg(long, conflicts_with = "csv")]
    pub at: Option<String>,
    #[arg(long)]
    pub csv: Option<PathBuf>,
}

#[derive(Debug, Args)]
pub struct EstimateArgs {
    pub item: String,
    #[arg(long)]
    pub low: String,
    #[arg(long)]
    pub high: String,
    #[arg(long)]
    pub note: Option<String>,
}

#[derive(Debug, Args)]
pub struct CompleteArgs {
    pub item: String,
    #[arg(long)]
    pub at: Option<String>,
}

#[derive(Debug, Args)]
pub struct ShareArgs {
    pub item: String,
    /// Also print the owner link, which can change the item.
    #[arg(long)]
    pub owner: bool,
}

#[derive(Debug, Subcommand)]
pub enum DashboardCommand {
    /// Make a dashboard.
    Create {
        #[arg(long)]
        name: String,
    },
    /// Add an item to a dashboard.
    Add { dashboard: String, item: String },
    /// Remove an entry (entry or item UUID) from a dashboard.
    Remove { dashboard: String, entry: String },
}

#[derive(Debug, Args)]
pub struct WatchArgs {
    pub item: String,
    /// Seconds between refreshes.
    #[arg(long, default_value_t = 5)]
    pub interval: u64,
    /// Never draw the share-card image.
    #[arg(long)]
    pub no_image: bool,
}

/// Runs one parsed command. Results go to `out`, prompts and errors to `err`.
pub fn execute(
    cli: Cli,
    config_dir: PathBuf,
    input: &mut dyn BufRead,
    out: &mut dyn Write,
    err: &mut dyn Write,
) -> i32 {
    let ctx = Context::new(&cli.host, config_dir);
    match dispatch(&ctx, cli.command, cli.json, input, out, err) {
        Ok(()) => 0,
        Err(error) => {
            let _ = writeln!(err, "done-when: {error}");
            1
        }
    }
}

pub fn dispatch(
    ctx: &Context,
    command: Command,
    json: bool,
    input: &mut dyn BufRead,
    out: &mut dyn Write,
    err: &mut dyn Write,
) -> CliResult<()> {
    match command {
        Command::Login => print(out, json, &ops::login(ctx, err)?),
        Command::New(NewCommand::Counter(args)) => {
            print(out, json, &ops::create_counter(ctx, &args.into())?)
        }
        Command::Add(args) => print(out, json, &add(ctx, &args)?),
        Command::Show(args) => print(out, json, &ops::show(ctx, &args.item)?),
        Command::List => print(out, json, &ops::list(ctx)?),
        Command::Estimate(args) => print(
            out,
            json,
            &ops::estimate(ctx, &args.item, &args.low, &args.high, args.note)?,
        ),
        Command::Complete(args) => print(
            out,
            json,
            &ops::complete(ctx, &args.item, args.at.as_deref())?,
        ),
        Command::Share(args) => print(out, json, &ops::share(ctx, &args.item, args.owner)?),
        Command::Dashboard(DashboardCommand::Create { name }) => {
            print(out, json, &ops::create_dashboard(ctx, &name)?)
        }
        Command::Dashboard(DashboardCommand::Add { dashboard, item }) => {
            print(out, json, &ops::dashboard_add(ctx, &dashboard, &item)?)
        }
        Command::Dashboard(DashboardCommand::Remove { dashboard, entry }) => {
            print(out, json, &ops::dashboard_remove(ctx, &dashboard, &entry)?)
        }
        Command::Watch(args) => crate::watch::run(
            ctx,
            &args.item,
            Duration::from_secs(args.interval.max(1)),
            !args.no_image,
        ),
        Command::Mcp => crate::mcp::serve(ctx, input, out),
    }
}

fn add(ctx: &Context, args: &AddArgs) -> CliResult<ops::AddReport> {
    let rows = match (&args.csv, args.value) {
        (Some(path), _) => {
            let text = std::fs::read_to_string(path)
                .map_err(|e| CliError::Usage(format!("read {}: {e}", path.display())))?;
            ops::parse_csv(&text)?
        }
        (None, Some(value)) => {
            let at = args.at.as_deref().map(ops::timestamp).transpose()?;
            vec![(at.unwrap_or_else(crate::time::now_rfc3339), value)]
        }
        (None, None) => return Err(CliError::Usage("give a value or --csv".to_owned())),
    };
    ops::add_measurements(ctx, &args.item, &rows)
}

fn print(out: &mut dyn Write, json: bool, report: &impl Report) -> CliResult<()> {
    let text = if json {
        serde_json::to_string_pretty(report).map_err(|e| CliError::Usage(e.to_string()))?
    } else {
        report.text()
    };
    writeln!(out, "{text}")?;
    Ok(())
}

impl From<CounterArgs> for CounterDraft {
    fn from(args: CounterArgs) -> Self {
        CounterDraft {
            name: args.name,
            target: args.target,
            unit: args.unit,
            start: args.start,
            started_at: args.started,
            deadline: args.deadline,
        }
    }
}
