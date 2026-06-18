//! Local-repository management commands: clone, add existing, detect remote,
//! list, remove. Each command updates the persisted `AppConfig` via
//! `ConfigState::mutate`.

use std::path::{Path, PathBuf};

use tauri::State;
use tauri_plugin_opener::OpenerExt;

use crate::config::store::ConfigState;
use crate::error::{AppError, AppResult};
use crate::git::remote::parse_remote_url;
use crate::git::run_in;
use crate::models::LocalRepo;

/// Generate a stable repo id from its absolute path.
fn repo_id_from_path(path: &Path) -> String {
    // Hash-ish: use the absolute path with separators normalized.
    let normalized = path
        .to_string_lossy()
        .replace(['/', '\\'], "_")
        .trim_start_matches('_')
        .to_lowercase();
    format!("repo_{normalized}")
}

/// Open the OS folder picker and return the selected directory, or `None`
/// if the user cancelled. Uses the opener plugin's `open_path` indirectly —
/// for a true picker we'd use the `tauri-plugin-dialog`, but opener can at
/// least reveal a path. Here we expose a manual path-input flow and validate.
#[tauri::command]
pub fn pick_directory() -> AppResult<Option<String>> {
    // Lightweight: return None so the frontend uses a manual text input.
    // (A native picker can be added via tauri-plugin-dialog later.)
    Ok(None)
}

/// Clone `url` into `parent_dir/<repo_name>`. Returns the new LocalRepo.
#[tauri::command]
pub async fn clone_repo(
    url: String,
    parent_dir: String,
    account_id: Option<String>,
    state: State<'_, ConfigState>,
) -> AppResult<LocalRepo> {
    // Validate the remote parses so we can derive a name + match an account.
    let remote = parse_remote_url(&url).ok_or_else(|| {
        AppError::Git(format!("Could not parse remote URL: {url}"))
    })?;

    let parent = PathBuf::from(&parent_dir);
    if !parent.is_dir() {
        return Err(AppError::NotFound(format!(
            "Directory does not exist: {parent_dir}"
        )));
    }

    let target = parent.join(&remote.repo);
    if target.exists() {
        return Err(AppError::Git(format!(
            "Target already exists: {}",
            target.display()
        )));
    }

    // Determine auth header if an account on the same host exists.
    let auth_header = auth_for_host(&state, &remote.host, account_id.as_deref())?;

    // Build the clone invocation. When auth is needed we pass it via
    // `http.extraHeader` as a one-off `-c` flag — the runner also accepts an
    // `auth_header` for subsequent operations, but clone is special because
    // the repo doesn't exist yet (no cwd git config to inherit).
    let target_str = target.to_string_lossy().into_owned();
    let mut args: Vec<String> = Vec::new();
    if let Some(ref header) = auth_header {
        args.push("-c".into());
        args.push(format!("http.extraHeader={header}"));
    }
    args.push("clone".into());
    args.push(url.clone());
    args.push(target_str.clone());

    let arg_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let out = run_in(&parent, &arg_refs, None).await?;
    out.require_success("git clone")?;

    register_local_repo(&target, Some(&remote), account_id, &state)
}

/// Add an existing local working copy to the app. Detects the remote and
/// tries to match an account.
#[tauri::command]
pub async fn add_local_repo(
    path: String,
    state: State<'_, ConfigState>,
) -> AppResult<LocalRepo> {
    let abs = PathBuf::from(&path);
    if !abs.is_dir() {
        return Err(AppError::NotFound(format!(
            "Not a directory: {path}"
        )));
    }
    // Must be inside a git repo.
    let git_dir = abs.join(".git");
    if !git_dir.exists() {
        return Err(AppError::Git(format!(
            "Not a git repository (no .git in {path})"
        )));
    }

    // Try to detect the remote; best-effort (a local-only repo is fine).
    let remote = detect_remote(&abs).await.ok();
    let account_id = remote
        .as_ref()
        .and_then(|r| find_account_by_host(&state, &r.host));

    register_local_repo(&abs, remote.as_ref(), account_id, &state)
}

/// Re-read the origin remote of a repo and refresh its host/full_name +
/// account match in config. Used after manual remote changes.
#[tauri::command]
pub async fn detect_remote_info(
    repo_id: String,
    state: State<'_, ConfigState>,
) -> AppResult<LocalRepo> {
    let path = state.read(|cfg| {
        Ok::<_, AppError>(
            cfg.repos
                .iter()
                .find(|r| r.id == repo_id)
                .map(|r| PathBuf::from(&r.path)),
        )
    })?;

    let abs = path.ok_or_else(|| AppError::NotFound(format!("Repo {repo_id} not found")))?;
    let remote = detect_remote(&abs).await.ok();
    let account_id = remote
        .as_ref()
        .and_then(|r| find_account_by_host(&state, &r.host));

    state.mutate(|cfg| {
        let repo = cfg
            .repos
            .iter_mut()
            .find(|r| r.id == repo_id)
            .ok_or_else(|| AppError::NotFound(format!("Repo {repo_id} not found")))?;
        if let Some(r) = &remote {
            repo.host = Some(r.host.clone());
            repo.full_name = Some(r.full_name.clone());
        }
        repo.account_id = account_id.clone();
        Ok(repo.clone())
    })
}

#[tauri::command]
pub fn list_local_repos(state: State<'_, ConfigState>) -> AppResult<Vec<LocalRepo>> {
    state.read(|cfg| Ok(cfg.repos.clone()))
}

#[tauri::command]
pub fn remove_repo(repo_id: String, state: State<'_, ConfigState>) -> AppResult<()> {
    state.mutate(|cfg| {
        cfg.repos.retain(|r| r.id != repo_id);
        Ok(())
    })
}

/// Open a repo's working directory in the OS file manager.
#[tauri::command]
pub fn reveal_in_finder(repo_id: String, app: tauri::AppHandle, state: State<'_, ConfigState>) -> AppResult<()> {
    let path = state.read(|cfg| {
        Ok::<_, AppError>(
            cfg.repos
                .iter()
                .find(|r| r.id == repo_id)
                .map(|r| r.path.clone()),
        )
    })?;
    let path = path.ok_or_else(|| AppError::NotFound(format!("Repo {repo_id} not found")))?;
    app.opener()
        .open_path(path, None::<&str>)
        .map_err(|e| AppError::Other(format!("Failed to reveal: {e}")))?;
    Ok(())
}

// --- helpers --------------------------------------------------------------

/// Read the `origin` remote URL from a working copy, if present.
async fn detect_remote(repo_path: &Path) -> AppResult<crate::git::remote::RemoteInfo> {
    let out = run_in(repo_path, &["remote", "get-url", "origin"], None).await?;
    let url = out
        .require_success("git remote get-url origin")?
        .trim()
        .to_string();
    parse_remote_url(&url)
        .ok_or_else(|| AppError::Git(format!("Unrecognized remote URL: {url}")))
}

/// Find the id of an account whose URL host matches `host`, if any.
fn find_account_by_host(state: &State<'_, ConfigState>, host: &str) -> Option<String> {
    state
        .read(|cfg| {
            Ok::<_, AppError>(
                cfg.accounts
                    .iter()
                    .find_map(|a| {
                        let url = url::Url::parse(&a.url).ok()?;
                        let account_host = url.host_str()?;
                        if account_host.eq_ignore_ascii_case(host) {
                            Some(a.id.clone())
                        } else {
                            None
                        }
                    }),
            )
        })
        .ok()
        .flatten()
}

/// Build the `Authorization: token …` header for a given host, preferring the
/// explicitly-passed account_id, else any account on the same host.
fn auth_for_host(
    state: &State<'_, ConfigState>,
    host: &str,
    account_id: Option<&str>,
) -> AppResult<Option<String>> {
    // Resolve the account id to use.
    let resolved_id = match account_id {
        Some(id) => Some(id.to_string()),
        None => find_account_by_host(state, host),
    };
    let Some(id) = resolved_id else {
        return Ok(None);
    };
    let token = crate::commands::account::token_for(&id)?;
    Ok(Some(format!("Authorization: token {token}")))
}

/// Insert (or update) a LocalRepo in config, returning the stored record.
fn register_local_repo(
    path: &Path,
    remote: Option<&crate::git::remote::RemoteInfo>,
    account_id: Option<String>,
    state: &State<'_, ConfigState>,
) -> AppResult<LocalRepo> {
    let id = repo_id_from_path(path);
    let name = path
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "repository".to_string());

    let repo = LocalRepo {
        id: id.clone(),
        path: path.to_string_lossy().into_owned(),
        name,
        host: remote.map(|r| r.host.clone()),
        full_name: remote.map(|r| r.full_name.clone()),
        account_id,
    };

    state.mutate(|cfg| {
        cfg.repos.retain(|r| r.id != id);
        cfg.repos.push(repo.clone());
        Ok(repo.clone())
    })
}
