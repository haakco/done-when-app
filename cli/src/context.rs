//! What every command needs: the app's host, the local store directory, the app's discovery
//! file (`/.well-known/custd.json`, which names its API origin, Site key and sign-in) and the
//! signed-in session, if any.

use std::cell::OnceCell;
use std::io::Write;
use std::path::PathBuf;
use std::time::Duration;

use custd_sdk::{
    AppClient, BrowserLogin, DeviceToken, HostedAppDiscovery, HostedAppSignIn,
    read_hosted_app_discovery,
};

use crate::error::{CliError, CliResult};
use crate::store::{Store, StoredSession};
use crate::time::now_seconds;

/// The production environment of the Done When app.
pub const DEFAULT_HOST: &str = "https://done-when.custd.dev";
const FETCH_TIMEOUT: Duration = Duration::from_secs(20);
const MAX_CARD_BYTES: u64 = 4 << 20;

const LOGIN_CALLBACK: &str = "http://localhost:43159/callback";

/// Runs browser sign-in against the hosted app’s OAuth client.
pub type LoginRunner =
    fn(&HostedAppSignIn, Vec<String>, &mut dyn Write) -> custd_sdk::Result<DeviceToken>;

pub struct Context {
    /// The app's origin, for example `https://done-when.custd.dev`.
    pub host: String,
    pub config_dir: PathBuf,
    pub login_runner: LoginRunner,
    discovery: OnceCell<HostedAppDiscovery>,
}

impl Context {
    pub fn new(host: impl Into<String>, config_dir: PathBuf) -> Self {
        Self {
            host: host.into().trim_end_matches('/').to_owned(),
            config_dir,
            login_runner: browser_login,
            discovery: OnceCell::new(),
        }
    }

    pub fn load_store(&self) -> CliResult<Store> {
        Store::load(&self.config_dir).map_err(|e| self.store_error(e))
    }

    pub fn save_store(&self, store: &Store) -> CliResult<()> {
        store
            .save(&self.config_dir)
            .map_err(|e| self.store_error(e))
    }

    fn store_error(&self, error: std::io::Error) -> CliError {
        let message = format!("local store in {}: {error}", self.config_dir.display());
        CliError::Io(std::io::Error::new(error.kind(), message))
    }

    pub fn discovery(&self) -> CliResult<&HostedAppDiscovery> {
        if let Some(discovery) = self.discovery.get() {
            return Ok(discovery);
        }
        let discovery = read_hosted_app_discovery(&self.host)?;
        Ok(self.discovery.get_or_init(|| discovery))
    }

    /// The signed-in session for this host, while it is still valid.
    pub fn session(&self) -> CliResult<Option<StoredSession>> {
        let store = self.load_store()?;
        Ok(store
            .session(&self.host)
            .filter(|session| session.is_live(now_seconds()))
            .cloned())
    }

    /// The SDK's app client, with the signed-in user's token while the session is valid. It is
    /// built per call, so a session that expires during `watch` or `mcp` stops being sent: the
    /// API refuses a request whose user token it cannot verify, even beside a valid link.
    pub fn app(&self) -> CliResult<AppClient> {
        let app = AppClient::from_discovery(self.discovery()?, &self.host);
        Ok(match self.session()? {
            Some(session) => app.with_user_token(session.access_token),
            None => app,
        })
    }
}

fn browser_login(
    sign_in: &HostedAppSignIn,
    scopes: Vec<String>,
    out: &mut dyn Write,
) -> custd_sdk::Result<DeviceToken> {
    BrowserLogin::new(sign_in, LOGIN_CALLBACK.to_owned(), scopes).run(|url| {
        let _ = writeln!(
            out,
            "Open this URL in your local browser to sign in:\n{url}"
        );
        let _ = out.flush();
    })
}

/// One GET of a share-card PNG the app's host serves.
pub fn fetch_card(url: &str) -> CliResult<Vec<u8>> {
    let config = ureq::Agent::config_builder()
        .max_redirects(0)
        .timeout_global(Some(FETCH_TIMEOUT))
        .user_agent(custd_sdk::SDK_IDENTITY)
        .build();
    let agent = ureq::Agent::new_with_config(config);
    let mut response = agent
        .get(url)
        .call()
        .map_err(|e| CliError::Fetch(format!("GET {url}: {e}")))?;
    response
        .body_mut()
        .with_config()
        .limit(MAX_CARD_BYTES)
        .read_to_vec()
        .map_err(|e| CliError::Fetch(format!("GET {url}: {e}")))
}
