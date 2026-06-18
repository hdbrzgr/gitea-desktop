//! Working-directory git commands: status, diff, stage, unstage, discard,
//! commit, fetch, pull, push. All operate on a repo identified by id
//! (resolved to a path via the helpers module).

use tauri::State;

use crate::commands::helpers::{auth_header_for_repo, repo_path};
use crate::config::store::ConfigState;
use crate::error::{AppError, AppResult};
use crate::git::run_in;
use crate::git::status::{parse_status, GitStatus};

/// Working-directory status (porcelain v1, parsed).
#[tauri::command]
pub async fn git_status(
    repo_id: String,
    state: State<'_, ConfigState>,
) -> AppResult<GitStatus> {
    let path = repo_path(&state, &repo_id)?;
    let out = run_in(&path, &["status", "--porcelain=v1", "-z", "--branch"], None).await?;
    let raw = out.require_success("git status")?;
    Ok(parse_status(&raw))
}

/// Unified diff for a path. When `staged` is true, diffs the index vs HEAD;
/// otherwise the working tree vs the index. For untracked files (`untracked`
/// = true), returns the full file contents as added lines.
#[tauri::command]
pub async fn git_diff(
    repo_id: String,
    path: String,
    staged: bool,
    untracked: bool,
    state: State<'_, ConfigState>,
) -> AppResult<String> {
    let repo_path = repo_path(&state, &repo_id)?;

    if untracked {
        let full = repo_path.join(&path);
        let bytes = tokio::fs::read(&full)
            .await
            .map_err(|e| AppError::Git(format!("Failed to read {path}: {e}")))?;
        let text = String::from_utf8_lossy(&bytes);
        return Ok(render_untracked_diff(&path, &text));
    }

    let mut args: Vec<String> = vec!["diff".into()];
    if staged {
        args.push("--cached".into());
    }
    args.push("--".into());
    args.push(path);
    let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let out = run_in(&repo_path, &refs, None).await?;
    out.require_success("git diff")
}

/// Stage one or more paths (`git add`).
#[tauri::command]
pub async fn git_stage(
    repo_id: String,
    paths: Vec<String>,
    state: State<'_, ConfigState>,
) -> AppResult<()> {
    let path = repo_path(&state, &repo_id)?;
    let mut args: Vec<String> = vec!["add".into(), "--".into()];
    args.extend(paths);
    let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let out = run_in(&path, &refs, None).await?;
    out.require_success("git add")?;
    Ok(())
}

/// Unstage one or more paths (`git reset -- <path>`).
#[tauri::command]
pub async fn git_unstage(
    repo_id: String,
    paths: Vec<String>,
    state: State<'_, ConfigState>,
) -> AppResult<()> {
    let path = repo_path(&state, &repo_id)?;
    let mut args: Vec<String> = vec!["reset".into(), "--".into()];
    args.extend(paths);
    let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let out = run_in(&path, &refs, None).await?;
    out.require_success("git reset")?;
    Ok(())
}

/// Discard working-tree changes for tracked paths (`git checkout --`) and
/// remove untracked files outright.
#[tauri::command]
pub async fn git_discard(
    repo_id: String,
    paths: Vec<String>,
    untracked: Vec<String>,
    state: State<'_, ConfigState>,
) -> AppResult<()> {
    let path = repo_path(&state, &repo_id)?;

    if !paths.is_empty() {
        let mut args: Vec<String> = vec!["checkout".into(), "--".into()];
        args.extend(paths);
        let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
        let out = run_in(&path, &refs, None).await?;
        out.require_success("git checkout")?;
    }

    for p in &untracked {
        let full = path.join(p);
        if full.exists() {
            let res = if full.is_dir() {
                tokio::fs::remove_dir_all(&full).await
            } else {
                tokio::fs::remove_file(&full).await
            };
            res.map_err(|e| AppError::Git(format!("Failed to remove {p}: {e}")))?;
        }
    }
    Ok(())
}

/// Commit staged changes. The message may span multiple lines (subject +
/// body separated by a blank line); we pass it via `-m`, which preserves
/// embedded newlines. Returns the new commit's short sha.
#[tauri::command]
pub async fn git_commit(
    repo_id: String,
    message: String,
    state: State<'_, ConfigState>,
) -> AppResult<String> {
    let path = repo_path(&state, &repo_id)?;
    let out = run_in(
        &path,
        &["commit", "--no-verify", "-m", message.as_str()],
        None,
    )
    .await?;
    let stdout = out.require_success("git commit")?;
    Ok(extract_commit_sha(&stdout).unwrap_or_default())
}

/// Fetch from origin (no merge). Uses the account token via http.extraHeader
/// when the repo has a matching account.
#[tauri::command]
pub async fn git_fetch(
    repo_id: String,
    state: State<'_, ConfigState>,
) -> AppResult<()> {
    let path = repo_path(&state, &repo_id)?;
    let auth = auth_header_for_repo(&state, &repo_id)?;
    let out = run_in(&path, &["fetch", "--prune", "origin"], auth.as_deref()).await?;
    out.require_success("git fetch")?;
    Ok(())
}

/// Pull (fast-forward) from origin. `recurse_submodules` defaults to true,
/// so a pull that moves submodule pointers also checks out the new commits
/// in each submodule (`--recurse-submodules`).
#[tauri::command]
pub async fn git_pull(
    repo_id: String,
    recurse_submodules: Option<bool>,
    state: State<'_, ConfigState>,
) -> AppResult<()> {
    let path = repo_path(&state, &repo_id)?;
    let auth = auth_header_for_repo(&state, &repo_id)?;
    let mut args: Vec<String> = vec!["pull".into(), "--ff-only".into()];
    if recurse_submodules.unwrap_or(true) {
        args.push("--recurse-submodules".into());
    }
    args.push("origin".into());
    let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let out = run_in(&path, &refs, auth.as_deref()).await?;
    out.require_success("git pull")?;
    Ok(())
}

/// Push the current branch to origin, setting upstream on first push.
#[tauri::command]
pub async fn git_push(
    repo_id: String,
    state: State<'_, ConfigState>,
) -> AppResult<()> {
    let path = repo_path(&state, &repo_id)?;
    let auth = auth_header_for_repo(&state, &repo_id)?;
    let out = run_in(&path, &["push", "-u", "origin", "HEAD"], auth.as_deref()).await?;
    out.require_success("git push")?;
    Ok(())
}

// --- helpers --------------------------------------------------------------

/// Render an untracked file as a diff where every line is added.
fn render_untracked_diff(path: &str, content: &str) -> String {
    let header = format!(
        "diff --git a/{path} b/{path}\nnew file mode 100644\n--- /dev/null\n+++ b/{path}\n"
    );
    let mut body = String::new();
    let added_lines = content.lines().count().max(1);
    body.push_str(&format!("@@ -0,0 +1,{added_lines} @@\n"));
    for line in content.lines() {
        body.push('+');
        body.push_str(line);
        body.push('\n');
    }
    format!("{header}{body}")
}

/// Parse the short sha out of `git commit`'s stdout, e.g.
/// `[main abc1234] subject`.
fn extract_commit_sha(stdout: &str) -> Option<String> {
    let bracket_start = stdout.find('[')?;
    let after = &stdout[bracket_start..];
    let bracket_end = after.find(']')?;
    let inside = &after[1..bracket_end];
    // inside looks like "main abc1234" — take the last whitespace token.
    let sha = inside.split_whitespace().last()?;
    if sha.chars().all(|c| c.is_ascii_hexdigit()) {
        Some(sha.to_string())
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_sha() {
        let out = "[main abc1234] Add a feature\n 1 file changed, 2 insertions(+)";
        assert_eq!(extract_commit_sha(out), Some("abc1234".into()));
    }

    #[test]
    fn renders_untracked() {
        let d = render_untracked_diff("foo.txt", "hello\nworld\n");
        assert!(d.contains("new file mode 100644"));
        assert!(d.contains("+hello"));
        assert!(d.contains("+world"));
    }
}
