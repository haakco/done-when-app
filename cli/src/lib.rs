//! Done When on the command line: commands, a live terminal view (`watch`) and a stdio MCP
//! server (`mcp`), all through the released Custd Rust SDK's app item routes.

pub mod cli;
pub mod context;
pub mod error;
pub mod links;
pub mod mcp;
pub mod operations;
pub mod ops;
pub mod report;
pub mod store;
pub mod time;
pub mod tui;
pub mod watch;
