//! Branch commands: list, current, create, checkout, delete, rename.
//! Operate on the superproject by default, or a submodule when `sub_path`
//! is provided.

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::commands::helpers::repo_workdir;
use crate::config::store::ConfigState;
use crate::error::AppResult;
use crate::git::run_in;

/// A local or remote-tracking branch.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalBranch {
    pub name: String,
    /// Short sha of the tip commit.
    pub sha: String,
    /// True for the currently checked-out branch.
    pub current: bool,
    /// True if this branch has a remote upstream (tracks origin).
    pub has_upstream: bool,
    /// Commits ahead of / behind its upstream, if any.
    pub ahead: Option<u32>,
    pub behind: Option<u32>,
}

/// List local branches with tip shas and upstream tracking info.
#[tauri::command]
pub async fn list_branches(
    repo_id: String,
    sub_path: Option<String>,
    state: State<'_, ConfigState>,
) -> AppResult<Vec<LocalBranch>> {
    let path = repo_workdir(&state, &repo_id, sub_path.as_deref())?;

    // `--format` gives us a stable, parseable line per branch.
    // We use a NUL-free custom format: name\tsha\tupstream\tahead,behind\t*flag
    let format = "%(refname:short)%09%(objectname:short)%09%(upstream:short)%09%(upstream:trackshort)";
    let out = run_in(&path, &["for-each-ref", "--format", format, "refs/heads"], None).await?;
    let raw = out.require_success("git for-each-ref")?;

    // We also need to know which branch is current.
    let current = run_in(&path, &["symbolic-ref", "--short", "HEAD"], None).await?;
    let current_name = current.require_success("git symbolic-ref").ok();
    let current_trimmed = current_name.as_deref().map(|s| s.trim());

    // And ahead/behind per branch vs upstream.
    let mut branches = Vec::new();
    for line in raw.lines() {
        if line.trim().is_empty() {
            continue;
        }
        let mut parts = line.splitn(4, '\t');
        let name = parts.next().unwrap_or("").to_string();
        let sha = parts.next().unwrap_or("").to_string();
        let upstream = parts.next().unwrap_or("").to_string();
        let trackshort = parts.next().unwrap_or("").to_string();
        if name.is_empty() {
            continue;
        }
        let has_upstream = !upstream.is_empty();
        let (ahead, behind) = if has_upstream {
            count_ahead_behind(&path, &name, &upstream).await.unwrap_or((0, 0))
        } else {
            (0, 0)
        };
        // trackshort is '<' (behind), '>' (ahead), '=' (equal), '' (no upstream)
        let _ = trackshort; // we use computed counts instead
        branches.push(LocalBranch {
            name: name.clone(),
            sha,
            current: current_trimmed == Some(name.as_str()),
            has_upstream,
            ahead: has_upstream.then_some(ahead),
            behind: has_upstream.then_some(behind),
        });
    }
    // Sort: current first, then alphabetical.
    branches.sort_by(|a, b| b.current.cmp(&a.current).then(a.name.cmp(&b.name)));
    Ok(branches)
}

/// Create a new branch from the given start point (default: HEAD).
#[tauri::command]
pub async fn create_branch(
    repo_id: String,
    name: String,
    start_point: Option<String>,
    checkout: Option<bool>,
    sub_path: Option<String>,
    state: State<'_, ConfigState>,
) -> AppResult<()> {
    let path = repo_workdir(&state, &repo_id, sub_path.as_deref())?;
    let start = start_point.as_deref().unwrap_or("HEAD");
    let do_checkout = checkout.unwrap_or(true);
    let out = run_in(&path, &["branch", name.as_str(), start], None).await?;
    out.require_success("git branch")?;
    if do_checkout {
        let out = run_in(&path, &["checkout", name.as_str()], None).await?;
        out.require_success("git checkout")?;
    }
    Ok(())
}

/// Checkout (switch to) an existing branch.
#[tauri::command]
pub async fn checkout_branch(
    repo_id: String,
    name: String,
    sub_path: Option<String>,
    state: State<'_, ConfigState>,
) -> AppResult<()> {
    let path = repo_workdir(&state, &repo_id, sub_path.as_deref())?;
    let out = run_in(&path, &["checkout", name.as_str()], None).await?;
    out.require_success("git checkout")?;
    Ok(())
}

/// Delete a local branch. `-D` forces deletion even if not merged.
#[tauri::command]
pub async fn delete_branch(
    repo_id: String,
    name: String,
    force: Option<bool>,
    sub_path: Option<String>,
    state: State<'_, ConfigState>,
) -> AppResult<()> {
    let path = repo_workdir(&state, &repo_id, sub_path.as_deref())?;
    let flag = if force.unwrap_or(false) { "-D" } else { "-d" };
    let out = run_in(&path, &["branch", flag, name.as_str()], None).await?;
    out.require_success("git branch -d")?;
    Ok(())
}

/// Rename the current branch.
#[tauri::command]
pub async fn rename_branch(
    repo_id: String,
    new_name: String,
    sub_path: Option<String>,
    state: State<'_, ConfigState>,
) -> AppResult<()> {
    let path = repo_workdir(&state, &repo_id, sub_path.as_deref())?;
    let out = run_in(&path, &["branch", "-m", new_name.as_str()], None).await?;
    out.require_success("git branch -m")?;
    Ok(())
}

// --- helpers --------------------------------------------------------------

/// Count commits `branch` is ahead/behind its `upstream`.
async fn count_ahead_behind(
    repo_path: &std::path::Path,
    branch: &str,
    upstream: &str,
) -> AppResult<(u32, u32)> {
    let spec = format!("{upstream}...{branch}");
    let out = run_in(
        repo_path,
        &["rev-list", "--left-right", "--count", spec.as_str()],
        None,
    )
    .await?;
    let raw = out.require_success("git rev-list --count")?;
    // Output: "<behind>\t<ahead>"
    let mut parts = raw.trim().split_whitespace();
    let behind: u32 = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);
    let ahead: u32 = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);
    let _ = branch;
    Ok((ahead, behind))
}
