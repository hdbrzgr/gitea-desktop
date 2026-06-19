//! Settings commands — currently just the default clone directory.
//!
//! These read/write the `AppConfig.settings` sub-object, so settings persist
//! alongside accounts/repos in config.json.

use tauri::State;

use crate::config::store::ConfigState;
use crate::error::AppResult;
use crate::models::Settings;
use crate::settings;

/// Effective settings as seen by the frontend. `default_clone_dir` is the
/// *resolved* value (user override or the ~/Documents/Gitea default), never
/// null — so the UI can show a real path out of the box.
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectiveSettings {
    pub default_clone_dir: String,
}

#[tauri::command]
pub fn get_settings(state: State<'_, ConfigState>) -> AppResult<EffectiveSettings> {
    state.read(|cfg| {
        Ok(EffectiveSettings {
            default_clone_dir: settings::effective_default_clone_dir_string(cfg)?,
        })
    })
}

/// Set the default clone directory. Validates the path (must be absolute and
/// creatable) before persisting. An empty string clears the override and
/// reverts to the ~/Documents/Gitea default.
#[tauri::command]
pub fn set_default_clone_dir(
    dir: String,
    state: State<'_, ConfigState>,
) -> AppResult<EffectiveSettings> {
    let trimmed = dir.trim();
    let resolved = if trimmed.is_empty() {
        None
    } else {
        Some(settings::validate_clone_dir(trimmed)?.to_string_lossy().into_owned())
    };
    state.mutate(|cfg| {
        cfg.settings.default_clone_dir = resolved.clone();
        Ok(())
    })?;
    // Return the effective value so the UI can confirm immediately.
    state.read(|cfg| {
        Ok(EffectiveSettings {
            default_clone_dir: settings::effective_default_clone_dir_string(cfg)?,
        })
    })
}

/// "Reset to default" helper — clears the override. Equivalent to calling
/// `set_default_clone_dir("")` but more discoverable from the frontend.
#[tauri::command]
pub fn reset_default_clone_dir(state: State<'_, ConfigState>) -> AppResult<EffectiveSettings> {
    set_default_clone_dir(String::new(), state)
}

// Silence: Settings is re-exported so future commands can extend the shape.
#[allow(unused_imports)]
use Settings as _Settings;
