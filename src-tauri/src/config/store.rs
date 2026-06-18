//! Persists `AppConfig` (accounts + repos) to the OS app-data directory and
//! stores each account's secret token in the OS keyring.
//!
//! The on-disk layout is:
//!   <app_data_dir>/GiteaDesktop/config.json   — accounts & repos (no secrets)
//!   Keychain entry "gitea-desktop:<account_id>" — token (secret)

use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use directories::ProjectDirs;

use crate::error::{AppError, AppResult};
use crate::models::AppConfig;

const KEYRING_SERVICE: &str = "com.gitea.desktop";

/// Returns the directory under which we store `config.json`, creating it if
/// necessary.
pub fn config_dir() -> AppResult<PathBuf> {
    let dirs = ProjectDirs::from("com", "gitea", "GiteaDesktop")
        .ok_or_else(|| AppError::Config("Could not locate app data directory".into()))?;
    let dir = dirs.data_dir().to_path_buf();
    if !dir.exists() {
        fs::create_dir_all(&dir)?;
    }
    Ok(dir)
}

fn config_file_path() -> AppResult<PathBuf> {
    Ok(config_dir()?.join("config.json"))
}

/// Save the given config to disk, overwriting any existing file.
pub fn save_config(config: &AppConfig) -> AppResult<()> {
    let path = config_file_path()?;
    let json = serde_json::to_string_pretty(config)?;
    // Write atomically: write to a temp file then rename, so a crash mid-write
    // can't corrupt the config.
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, json)?;
    fs::rename(tmp, path)?;
    Ok(())
}

/// Load config from disk. Returns a default (empty) config if the file does
/// not exist yet — the common first-run case.
pub fn load_config() -> AppResult<AppConfig> {
    let path = config_file_path()?;
    if !path.exists() {
        return Ok(AppConfig::default());
    }
    let contents = fs::read_to_string(&path)?;
    if contents.trim().is_empty() {
        return Ok(AppConfig::default());
    }
    let config: AppConfig = serde_json::from_str(&contents)?;
    Ok(config)
}

// --- Token storage (OS keyring) -------------------------------------------

/// Store a token in the keyring under the account id.
pub fn store_token(account_id: &str, token: &str) -> AppResult<()> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, account_id)?;
    entry.set_password(token)?;
    Ok(())
}

/// Retrieve a token from the keyring.
pub fn get_token(account_id: &str) -> AppResult<String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, account_id)?;
    entry
        .get_password()
        .map_err(|e| AppError::Auth(format!("Token not found for account: {e}")))
}

/// Delete a token from the keyring. No-op if it doesn't exist.
pub fn delete_token(account_id: &str) -> AppResult<()> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, account_id)?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(AppError::Config(format!("Failed to delete token: {e}"))),
    }
}

/// Convenience wrapper around `Mutex<AppConfig>` held in `tauri::State`.
/// We keep config in memory and write-through on every mutation, so the
/// in-memory copy is always authoritative and the disk file is a backup.
pub struct ConfigState {
    pub config: Mutex<AppConfig>,
}

impl ConfigState {
    pub fn new(config: AppConfig) -> Self {
        Self {
            config: Mutex::new(config),
        }
    }

    /// Run a closure against a *locked* config, then persist the result.
    pub fn mutate<F, T>(&self, f: F) -> AppResult<T>
    where
        F: FnOnce(&mut AppConfig) -> AppResult<T>,
    {
        let result = {
            let mut guard = self
                .config
                .lock()
                .map_err(|e| AppError::Config(format!("Config lock poisoned: {e}")))?;
            f(&mut guard)?
        };
        // Persist whatever the closure produced.
        let snapshot = {
            let guard = self
                .config
                .lock()
                .map_err(|e| AppError::Config(format!("Config lock poisoned: {e}")))?;
            guard.clone()
        };
        save_config(&snapshot)?;
        Ok(result)
    }

    /// Run a closure against a locked config read-only.
    pub fn read<F, T>(&self, f: F) -> AppResult<T>
    where
        F: FnOnce(&AppConfig) -> AppResult<T>,
    {
        let guard = self
            .config
            .lock()
            .map_err(|e| AppError::Config(format!("Config lock poisoned: {e}")))?;
        f(&guard)
    }
}
