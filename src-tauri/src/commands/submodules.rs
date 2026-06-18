//! Submodule management commands.
//!
//! Submodules are nested repositories tracked by a parent repo. We parse
//! `git submodule status` (porcelain-ish, one line per submodule) into typed
//! records and expose init/update/sync operations so the UI can keep them
//! current.
//!
//! `git submodule status` line format (from git docs):
//!   <status-char><sha> <path> (<desc>)
//! where <status-char> is:
//!   ' ' (space) — submodule is up to date
//!   '-'         — submodule is not initialized
//!   '+'         — the checked-out SHA differs from the SHA recorded in the
//!                 superproject (typically after fetching new commits)
//!   'U'         — merge conflicts

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::commands::helpers::repo_path;
use crate::config::store::ConfigState;
use crate::error::AppResult;
use crate::git::run_in;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SubmoduleState {
    /// Up to date with the commit recorded in the superproject.
    UpToDate,
    /// Not initialized (`.git/modules` entry exists but the working copy is
    /// empty).
    NotInitialized,
    /// Checked-out SHA differs from the recorded one.
    Modified,
    /// Merge conflict.
    Conflicted,
    /// Unknown / couldn't classify.
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Submodule {
    /// Path relative to the superproject's working directory.
    pub path: String,
    /// SHA recorded/checked out (40 hex chars), empty when not initialized.
    pub sha: String,
    /// Short SHA for compact display (first 7).
    pub short_sha: String,
    /// Branch name if the submodule tracks one (git records this as `branch`
    /// in `.gitmodules`); surfaced for display.
    pub branch: Option<String>,
    /// Configured remote URL of the submodule (from `.gitmodules`).
    pub url: String,
    pub state: SubmoduleState,
    /// The human-readable descriptor in parentheses, if any.
    pub description: Option<String>,
}

/// List all submodules of a repo, with state classification.
#[tauri::command]
pub async fn list_submodules(
    repo_id: String,
    state: State<'_, ConfigState>,
) -> AppResult<Vec<Submodule>> {
    let path = repo_path(&state, &repo_id)?;

    // `git submodule status` returns one line per submodule. We pass
    // `--recursive` so nested submodules are flattened into the list too.
    let out = run_in(&path, &["submodule", "status", "--recursive"], None).await?;
    let raw = out.require_success("git submodule status")?;

    // Build a map of path -> url/branch from .gitmodules for richer display.
    let modules = parse_gitmodules(&path).await.unwrap_or_default();

    let mut submodules = Vec::new();
    for line in raw.lines() {
        if line.trim().is_empty() {
            continue;
        }
        // Line shape: "<flag>40-hex-sha> path (desc)"
        // The flag char is the first character; then a space, the sha, a
        // space, the path, optionally " (description)".
        let chars: Vec<char> = line.chars().collect();
        if chars.len() < 42 {
            continue;
        }
        let flag = chars[0];
        // sha is chars[1..41] after the flag char and before the space.
        // Actually format is "<flag><sha> <path>...". Flag is 1 char, no
        // space between flag and sha.
        let sha: String = chars[1..41].iter().collect();
        let rest: String = chars[41..].iter().collect();
        let rest = rest.trim_start();
        // Split path from optional (description).
        let (path_field, desc) = match rest.find(" (") {
            Some(idx) => (&rest[..idx], rest[idx + 2..].strip_suffix(')')),
            None => (rest, None),
        };
        let sub_state = match flag {
            ' ' => SubmoduleState::UpToDate,
            '-' => SubmoduleState::NotInitialized,
            '+' => SubmoduleState::Modified,
            'U' => SubmoduleState::Conflicted,
            _ => SubmoduleState::Unknown,
        };
        let sub_path = path_field.trim().to_string();
        let meta = modules.get(&sub_path);
        submodules.push(Submodule {
            path: sub_path.clone(),
            short_sha: sha.get(..7).unwrap_or(&sha).to_string(),
            sha,
            branch: meta.and_then(|m| m.branch.clone()),
            url: meta.map(|m| m.url.clone()).unwrap_or_default(),
            state: sub_state,
            description: desc.map(|s| s.to_string()),
        });
    }

    Ok(submodules)
}

/// Initialize submodules that haven't been set up yet
/// (`git submodule init` + `git submodule update`).
///
/// `init_all` true runs on every submodule; false requires a `paths` list.
#[tauri::command]
pub async fn init_submodules(
    repo_id: String,
    paths: Option<Vec<String>>,
    state: State<'_, ConfigState>,
) -> AppResult<()> {
    let path = repo_path(&state, &repo_id)?;
    // init with no args initializes all; with paths, only those.
    let mut args: Vec<String> = vec!["submodule".into(), "init".into()];
    if let Some(p) = &paths {
        args.push("--".into());
        args.extend(p.iter().cloned());
    }
    let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let out = run_in(&path, &refs, None).await?;
    out.require_success("git submodule init")?;
    Ok(())
}

/// Update submodules: fetch + check out the SHA recorded in the superproject.
/// Use this after a pull/checkout that changed submodule pointers.
#[tauri::command]
pub async fn update_submodules(
    repo_id: String,
    paths: Option<Vec<String>>,
    recursive: Option<bool>,
    state: State<'_, ConfigState>,
) -> AppResult<()> {
    let path = repo_path(&state, &repo_id)?;
    // We need auth for submodules whose URLs are on the same host as the
    // parent repo's account. Reuse the parent's auth header — git propagates
    // http.extraHeader to submodule fetches.
    let auth = crate::commands::helpers::auth_header_for_repo(&state, &repo_id)?;

    let mut args: Vec<String> = vec!["submodule".into(), "update".into()];
    if recursive.unwrap_or(true) {
        args.push("--recursive".into());
    }
    // `--init` ensures not-yet-initialized submodules get set up too.
    args.push("--init".into());
    // Use `--remote` only when explicitly requested elsewhere; default
    // behavior checks out the superproject-recorded SHA, which is the safe
    // choice.
    if let Some(p) = &paths {
        args.push("--".into());
        args.extend(p.iter().cloned());
    }
    let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let out = run_in(&path, &refs, auth.as_deref()).await?;
    out.require_success("git submodule update")?;
    Ok(())
}

/// Sync submodule remote URLs from `.gitmodules` into the local config
/// (`git submodule sync`). Run this when submodule URLs change upstream.
#[tauri::command]
pub async fn sync_submodules(
    repo_id: String,
    recursive: Option<bool>,
    state: State<'_, ConfigState>,
) -> AppResult<()> {
    let path = repo_path(&state, &repo_id)?;
    let mut args: Vec<String> = vec!["submodule".into(), "sync".into()];
    if recursive.unwrap_or(true) {
        args.push("--recursive".into());
    }
    let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let out = run_in(&path, &refs, None).await?;
    out.require_success("git submodule sync")?;
    Ok(())
}

/// Fetch new commits inside submodules (`git submodule update --remote`),
/// advancing each submodule to its tracked branch's tip. Useful for pulling
/// the latest submodule changes beyond what the superproject pins.
#[tauri::command]
pub async fn fetch_submodule_updates(
    repo_id: String,
    recursive: Option<bool>,
    state: State<'_, ConfigState>,
) -> AppResult<()> {
    let path = repo_path(&state, &repo_id)?;
    let auth = crate::commands::helpers::auth_header_for_repo(&state, &repo_id)?;
    let mut args: Vec<String> = vec!["submodule".into(), "update".into(), "--remote".into()];
    if recursive.unwrap_or(true) {
        args.push("--recursive".into());
    }
    let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let out = run_in(&path, &refs, auth.as_deref()).await?;
    out.require_success("git submodule update --remote")?;
    Ok(())
}

// --- helpers --------------------------------------------------------------

/// One submodule's metadata parsed from `.gitmodules`.
struct GitModule {
    url: String,
    branch: Option<String>,
}

/// Parse `.gitmodules` at the repo root into a path -> metadata map.
/// This is an INI-ish file; we only care about `path`, `url`, and `branch`.
async fn parse_gitmodules(
    repo_path: &std::path::Path,
) -> AppResult<std::collections::HashMap<String, GitModule>> {
    let mut map = std::collections::HashMap::new();
    let file = repo_path.join(".gitmodules");
    let contents = match tokio::fs::read_to_string(&file).await {
        Ok(c) => c,
        Err(_) => return Ok(map), // no submodules configured
    };

    let mut current_path: Option<String> = None;
    let mut current_url: Option<String> = None;
    let mut current_branch: Option<String> = None;

    let flush = |map: &mut std::collections::HashMap<String, GitModule>,
                 path: &Option<String>,
                 url: &Option<String>,
                 branch: &Option<String>| {
        if let (Some(p), Some(u)) = (path, url) {
            map.insert(
                p.clone(),
                GitModule {
                    url: u.clone(),
                    branch: branch.clone(),
                },
            );
        }
    };

    for raw in contents.lines() {
        let line = raw.trim();
        if line.starts_with('[') {
            // new section — flush previous
            flush(&mut map, &current_path, &current_url, &current_branch);
            current_path = None;
            current_url = None;
            current_branch = None;
            continue;
        }
        if let Some((key, value)) = line.split_once('=') {
            let key = key.trim();
            let value = value.trim().trim_matches('"');
            match key {
                "path" => current_path = Some(value.to_string()),
                "url" => current_url = Some(value.to_string()),
                "branch" => current_branch = Some(value.to_string()),
                _ => {}
            }
        }
    }
    flush(&mut map, &current_path, &current_url, &current_branch);
    Ok(map)
}
