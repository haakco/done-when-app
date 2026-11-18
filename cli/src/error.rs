use std::fmt;
use std::io;

/// Why a command failed. Messages never carry a link token.
#[derive(Debug)]
pub enum CliError {
    /// The Custd API refused or could not be reached.
    Sdk(custd_sdk::Error),
    /// A share card could not be read, or an answer made no sense.
    Fetch(String),
    /// The local store, a file or the terminal could not be read or written.
    Io(io::Error),
    /// Measurements were stored, then the forecast run failed.
    ForecastAfterWrite {
        accepted: i64,
        error: custd_sdk::Error,
    },
    /// The input cannot be used.
    Usage(String),
    /// The item was opened with a share link, which only reads.
    ReadOnly,
    /// The command does not apply to this kind of item.
    WrongKind(String),
    /// Nothing known locally or by link matches the reference.
    UnknownItem,
}

impl fmt::Display for CliError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            CliError::Sdk(error) => write!(f, "{error}"),
            CliError::Fetch(message) => write!(f, "{message}"),
            CliError::Io(error) => write!(f, "{error}"),
            CliError::ForecastAfterWrite { accepted, error } => write!(
                f,
                "{accepted} measurement(s) were stored, but the forecast run failed ({error}); \
                 do not add them again: the next `add` or the web page reruns the forecast"
            ),
            CliError::Usage(message) => write!(f, "{message}"),
            CliError::ReadOnly => f.write_str(
                "this is a read-only share link; use the owner link (or the name of an item made here) to change it",
            ),
            CliError::WrongKind(message) => write!(f, "{message}"),
            CliError::UnknownItem => f.write_str(
                "no item with that name is saved here, and it is not a Done When link; pass its share or owner link",
            ),
        }
    }
}

impl std::error::Error for CliError {}

impl From<custd_sdk::Error> for CliError {
    fn from(error: custd_sdk::Error) -> Self {
        CliError::Sdk(error)
    }
}

impl From<io::Error> for CliError {
    fn from(error: io::Error) -> Self {
        CliError::Io(error)
    }
}

pub type CliResult<T> = Result<T, CliError>;
