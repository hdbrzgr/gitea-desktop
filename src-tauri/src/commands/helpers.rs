//! Shared helpers for command modules.

use std::path::{Component, PathBuf};

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

/// Resolve a repo id plus an optional sub-path (a submodule directory within
/// the repo) to the actual working directory a git command should run in.
///
/// - `sub_path = None` → the superproject's working copy.
/// - `sub_path = Some("vendor/lib")` → `<repo>/vendor/lib` (a submodule).
///
/// The sub-path is sanitized: it must be relative and cannot escape the repo
/// root (no `..`, no absolute paths). This prevents path-traversal abuse.
pub fn repo_workdir(
    state: &State<'_, ConfigState>,
    repo_id: &str,
    sub_path: Option<&str>,
) -> AppResult<PathBuf> {
    let root = repo_path(state, repo_id)?;
    match sub_path {
        None => Ok(root),
        Some(rel) => {
            let rel = rel.trim();
            if rel.is_empty() {
                return Ok(root);
            }
            // Reject anything that isn't a clean relative path.
            let candidate = PathBuf::from(rel);
            if candidate
                .components()
                .any(|c| matches!(c, Component::ParentDir | Component::RootDir))
                || candidate.is_absolute()
            {
                return Err(AppError::Git(format!(
                    "Invalid sub-path '{rel}': must be a relative path inside the repo"
                )));
            }
            Ok(root.join(candidate))
        }
    }
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

