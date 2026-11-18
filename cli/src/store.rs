//! The local store: owner and share links of items made or claimed here, and the signed-in
//! session. One JSON file in the platform config directory, readable by its owner only: mode
//! 0600 in a 0700 directory on Unix. On Windows it lives in `%APPDATA%\done-when`, whose
//! inherited user-profile ACL already admits only that user, SYSTEM and Administrators; the CLI
//! sets no ACL of its own, so a profile whose ACL was widened widens the store with it.

use std::fmt;
use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::links::ItemKind;

const STORE_FILE: &str = "store.json";
/// A session this close to expiry is treated as signed out, so no request carries a token
/// that expires on the way.
const SESSION_MARGIN_SECONDS: i64 = 60;

/// `$XDG_CONFIG_HOME/done-when`, `~/Library/Application Support/done-when` or
/// `%APPDATA%\done-when`.
pub fn default_config_dir() -> Option<PathBuf> {
    let base = if cfg!(windows) {
        std::env::var_os("APPDATA").map(PathBuf::from)
    } else if cfg!(target_os = "macos") {
        std::env::var_os("HOME").map(|home| PathBuf::from(home).join("Library/Application Support"))
    } else {
        std::env::var_os("XDG_CONFIG_HOME")
            .filter(|dir| !dir.is_empty())
            .map(PathBuf::from)
            .or_else(|| std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".config")))
    };
    base.map(|dir| dir.join("done-when"))
}

#[derive(Default, Serialize, Deserialize)]
pub struct Store {
    #[serde(default)]
    pub items: Vec<StoredItem>,
    #[serde(default)]
    pub sessions: Vec<StoredSession>,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct StoredItem {
    pub host: String,
    pub item_uuid: String,
    pub kind: ItemKind,
    pub name: String,
    pub owner_token: Option<String>,
    pub share_token: Option<String>,
    pub saved_at: String,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct StoredSession {
    pub host: String,
    pub access_token: String,
    pub refresh_token: Option<String>,
    /// Unix seconds.
    pub expires_at: i64,
}

impl Store {
    pub fn load(dir: &Path) -> io::Result<Store> {
        match fs::read(dir.join(STORE_FILE)) {
            Ok(bytes) => serde_json::from_slice(&bytes).map_err(|e| {
                io::Error::new(io::ErrorKind::InvalidData, format!("{STORE_FILE}: {e}"))
            }),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(Store::default()),
            Err(error) => Err(error),
        }
    }

    /// Writes the whole store to a temporary file and renames it into place, owner-only.
    pub fn save(&self, dir: &Path) -> io::Result<()> {
        create_private_dir(dir)?;
        let temporary = dir.join(format!("{STORE_FILE}.tmp"));
        let mut file = private_file(&temporary)?;
        file.write_all(&serde_json::to_vec_pretty(self).map_err(io::Error::other)?)?;
        file.sync_all()?;
        fs::rename(temporary, dir.join(STORE_FILE))
    }

    pub fn find(&self, host: &str, reference: &str) -> Option<&StoredItem> {
        let mut on_host = self.items.iter().filter(|item| item.host == host);
        on_host.find(|item| item.item_uuid == reference || item.name == reference)
    }

    pub fn find_by_token(&self, host: &str, token: &str) -> Option<&StoredItem> {
        self.items.iter().find(|item| {
            item.host == host
                && (item.owner_token.as_deref() == Some(token)
                    || item.share_token.as_deref() == Some(token))
        })
    }

    pub fn items_on(&self, host: &str) -> impl Iterator<Item = &StoredItem> {
        self.items.iter().filter(move |item| item.host == host)
    }

    pub fn upsert(&mut self, item: StoredItem) {
        match self
            .items
            .iter_mut()
            .find(|known| known.host == item.host && known.item_uuid == item.item_uuid)
        {
            Some(known) => *known = item,
            None => self.items.push(item),
        }
    }

    pub fn session(&self, host: &str) -> Option<&StoredSession> {
        self.sessions.iter().find(|session| session.host == host)
    }

    pub fn set_session(&mut self, session: StoredSession) {
        self.sessions.retain(|known| known.host != session.host);
        self.sessions.push(session);
    }
}

#[cfg(unix)]
fn create_private_dir(dir: &Path) -> io::Result<()> {
    use std::os::unix::fs::DirBuilderExt;
    fs::DirBuilder::new()
        .recursive(true)
        .mode(0o700)
        .create(dir)
}

#[cfg(not(unix))]
fn create_private_dir(dir: &Path) -> io::Result<()> {
    fs::create_dir_all(dir)
}

#[cfg(unix)]
fn private_file(path: &Path) -> io::Result<fs::File> {
    use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
    let file = fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .mode(0o600)
        .open(path)?;
    // An older file keeps its mode on open; set it again.
    file.set_permissions(fs::Permissions::from_mode(0o600))?;
    Ok(file)
}

#[cfg(not(unix))]
fn private_file(path: &Path) -> io::Result<fs::File> {
    // Windows: the file inherits the per-user %APPDATA% directory's ACL (see the module docs).
    fs::File::create(path)
}

impl StoredSession {
    pub fn is_live(&self, now: i64) -> bool {
        self.expires_at > now + SESSION_MARGIN_SECONDS
    }
}

impl fmt::Debug for StoredItem {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("StoredItem")
            .field("host", &self.host)
            .field("item_uuid", &self.item_uuid)
            .field("kind", &self.kind)
            .field("name", &self.name)
            .field(
                "owner_token",
                &self.owner_token.as_ref().map(|_| "<redacted>"),
            )
            .field(
                "share_token",
                &self.share_token.as_ref().map(|_| "<redacted>"),
            )
            .finish()
    }
}

impl fmt::Debug for StoredSession {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("StoredSession")
            .field("host", &self.host)
            .field("access_token", &"<redacted>")
            .field("expires_at", &self.expires_at)
            .finish()
    }
}
