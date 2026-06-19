//! User settings: the configurable default clone directory and any future
//! preferences.
//!
//! `default_clone_dir()` resolves the effective value: an explicit override
//! stored in `AppConfig.settings`, or `~/Documents/Gitea` when unset. The
//! directory is created if missing so the first clone just works.

use std::path::PathBuf;

use crate::error::{AppError, AppResult};
use crate::models::AppConfig;

/// The fallback default clone directory when the user hasn't set one.
const FALLBACK_REL: &str = "Documents/Gitea";

/// Resolve the effective default clone directory for the current user.
///
/// Returns the user's override if set and non-empty; otherwise computes
/// `~/Documents/Gitea`. The directory is created if it doesn't already exist
/// so cloning into it never fails with "directory does not exist".
pub fn effective_default_clone_dir(cfg: &AppConfig) -> AppResult<PathBuf> {
    let path = match cfg.settings.default_clone_dir.as_deref() {
        Some(p) if !p.trim().is_empty() => PathBuf::from(p.trim()),
        _ => {
            // ~/Documents/Gitea
            let home = dirs::home_dir().ok_or_else(|| {
                AppError::Config("Could not determine home directory".into())
            })?;
            home.join(FALLBACK_REL)
        }
    };
    ensure_dir(&path)?;
    Ok(path)
}

/// Resolve as a string (for sending to the frontend).
pub fn effective_default_clone_dir_string(cfg: &AppConfig) -> AppResult<String> {
    Ok(effective_default_clone_dir(cfg)?.to_string_lossy().into_owned())
}

/// Create a directory (and parents) if it doesn't exist. No-op if present.
pub fn ensure_dir(path: &std::path::Path) -> AppResult<()> {
    if !path.exists() {
        std::fs::create_dir_all(path)?;
    }
    Ok(())
}

/// Validate that a candidate default-clone directory is usable: it must be
/// an absolute path, and we must be able to create it (or it already exists).
/// Returns the normalized path on success.
pub fn validate_clone_dir(candidate: &str) -> AppResult<PathBuf> {
    let trimmed = candidate.trim();
    if trimmed.is_empty() {
        return Err(AppError::Config("Clone directory cannot be empty".into()));
    }
    let path = PathBuf::from(trimmed);
    if !path.is_absolute() {
        return Err(AppError::Config(format!(
            "Clone directory must be an absolute path: {trimmed}"
        )));
    }
    ensure_dir(&path)?;
    Ok(path)
}
