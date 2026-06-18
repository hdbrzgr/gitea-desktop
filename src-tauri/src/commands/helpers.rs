//! Shared helpers for command modules.

use std::path::PathBuf;

use tauri::State;

use crate::config::store::ConfigState;
use crate::error::{AppError, AppResult};

/// Resolve a repo id to its absolute working-copy path.
pub fn repo_path(state: &State<'_, ConfigState>, repo_id: &str) -> AppResult<PathBuf> {
    let opt = state.read(|cfg| {
        Ok::<_, AppError>(
            cfg.repos
                .iter()
                .find(|r| r.id == repo_id)
                .map(|r| PathBuf::from(&r.path)),
        )
    })?;
    opt.ok_or_else(|| AppError::NotFound(format!("Repo {repo_id} not found")))
}

/// Build the `Authorization: token …` header for a repo's remote, if a
/// matching account exists. Used by fetch/pull/push so the token never has
/// to live in the remote URL.
pub fn auth_header_for_repo(
    state: &State<'_, ConfigState>,
    repo_id: &str,
) -> AppResult<Option<String>> {
    let account_id = state.read(|cfg| {
        Ok::<_, AppError>(
            cfg.repos
                .iter()
                .find(|r| r.id == repo_id)
                .and_then(|r| r.account_id.clone()),
        )
    })?;
    match account_id {
        Some(id) => {
            let token = crate::commands::account::token_for(&id)?;
            Ok(Some(format!("Authorization: token {token}")))
        }
        None => Ok(None),
    }
}
