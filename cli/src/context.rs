//! What every command needs: the app's host, the local store directory, and the app's
//! discovery file (`/.well-known/custd.json`), which names its API origin, Site key and sign-in.

use std::cell::OnceCell;
use std::io::Write;
use std::path::PathBuf;
use std::time::Duration;

use custd_sdk::{AppClient, DeviceInstructions, DeviceLogin, DeviceToken};
use serde::Deserialize;

use crate::error::{CliError, CliResult};
use crate::store::Store;

pub const DEFAULT_HOST: &str = "https://done-when.apps.custd.com";
const DISCOVERY_PATH: &str = "/.well-known/custd.json";
const FETCH_TIMEOUT: Duration = Duration::from_secs(20);
const MAX_CARD_BYTES: u64 = 4 << 20;

/// Runs the device login; replaced in tests, because the SDK requires an HTTPS issuer.
pub type LoginRunner = fn(&DeviceLogin, &mut dyn Write) -> custd_sdk::Result<DeviceToken>;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Discovery {
    pub api_base_url: String,
    pub browser_key: String,
    pub sign_in: Option<DiscoverySignIn>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoverySignIn {
    pub issuer: String,
    pub client_id: String,
    pub audience: String,
}

pub struct Context {
    /// The app's origin, for example `https://done-when.apps.custd.com`.
    pub host: String,
    pub config_dir: PathBuf,
    pub login_runner: LoginRunner,
    discovery: OnceCell<Discovery>,
    app: OnceCell<AppClient>,
}

impl Context {
    pub fn new(host: impl Into<String>, config_dir: PathBuf) -> Self {
        Self {
            host: host.into().trim_end_matches('/').to_owned(),
            config_dir,
            login_runner: device_login,
            discovery: OnceCell::new(),
            app: OnceCell::new(),
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

    pub fn discovery(&self) -> CliResult<&Discovery> {
        if let Some(discovery) = self.discovery.get() {
            return Ok(discovery);
        }
        let body = fetch(&format!("{}{DISCOVERY_PATH}", self.host), 1 << 20)?;
        let discovery: Discovery = serde_json::from_slice(&body)
            .map_err(|e| CliError::Fetch(format!("{} discovery file: {e}", self.host)))?;
        Ok(self.discovery.get_or_init(|| discovery))
    }

    /// The SDK's app client: the discovery file's API origin and Site key, with this host as Origin.
    pub fn app(&self) -> CliResult<&AppClient> {
        if let Some(app) = self.app.get() {
            return Ok(app);
        }
        let discovery = self.discovery()?;
        let app = AppClient::new(&discovery.api_base_url, &discovery.browser_key, &self.host);
        Ok(self.app.get_or_init(|| app))
    }
}

fn device_login(login: &DeviceLogin, out: &mut dyn Write) -> custd_sdk::Result<DeviceToken> {
    login.run(|instructions: &DeviceInstructions| {
        let code = custd_sdk::device_user_code_groups(&instructions.user_code).join("-");
        // The prompt is best effort; the login itself reports any failure.
        let _ = writeln!(
            out,
            "Open {} and enter the code {code} (valid for {} minutes).",
            instructions.verification_uri,
            instructions.expires_in.as_secs() / 60
        );
        let _ = out.flush();
    })
}

/// One GET of a public file the app's host serves: the discovery file or a share-card PNG.
pub fn fetch(url: &str, limit: u64) -> CliResult<Vec<u8>> {
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
        .limit(limit)
        .read_to_vec()
        .map_err(|e| CliError::Fetch(format!("GET {url}: {e}")))
}

pub fn fetch_card(url: &str) -> CliResult<Vec<u8>> {
    fetch(url, MAX_CARD_BYTES)
}
