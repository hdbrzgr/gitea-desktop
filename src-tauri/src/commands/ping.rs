//! Misc diagnostic commands used by the frontend on startup.

use crate::error::AppResult;
use crate::git::check_git_available;

/// Return the installed git version, or an error if git isn't on PATH.
#[tauri::command]
pub async fn ping_git() -> AppResult<String> {
    check_git_available().await
}
