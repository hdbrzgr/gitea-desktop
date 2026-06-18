//! Thin wrapper around spawning the system `git` binary.
//!
//! All git operations in the app funnel through `Runner`. It runs `git` with
//! `GIT_TERMINAL_PROMPT=0` so git never blocks waiting for credentials on a
//! TTY — instead it fails fast and we surface the error. Optional auth is
//! injected via `http.extraHeader` for HTTPS remotes (the token never lands
//! in remote URLs or git config).

use std::process::Stdio;

use tokio::process::Command;

use crate::error::{AppError, AppResult};

/// Captured result of a single git invocation.
pub struct GitOutput {
    pub code: i32,
    pub stdout: String,
    pub stderr: String,
}

impl GitOutput {
    /// Require exit code 0; otherwise turn stderr (or a fallback) into an
    /// `AppError::Git`.
    pub fn require_success(self, context: &str) -> AppResult<String> {
        if self.code == 0 {
            Ok(self.stdout)
        } else {
            let detail = if self.stderr.trim().is_empty() {
                self.stdout.trim().to_string()
            } else {
                self.stderr.trim().to_string()
            };
            Err(AppError::Git(format!(
                "{context} failed (exit {}): {detail}",
                self.code
            )))
        }
    }
}

/// Build the environment for a git invocation. We always disable terminal
/// prompts and credential helpers that might pop GUI prompts, and pin
/// non-interactive defaults.
fn env_base() -> Vec<(&'static str, &'static str)> {
    vec![
        ("GIT_TERMINAL_PROMPT", "0"),
        ("GIT_ASKPASS", ""),
        ("SSH_ASKPASS", ""),
        ("GIT_CONFIG_NOSYSTEM", "1"),
    ]
}

/// Run `git` with the given args inside `cwd`. If `auth_header` is supplied,
/// it's injected as `http.extraHeader` — used for HTTPS remote auth.
pub async fn run_in(
    cwd: &std::path::Path,
    args: &[&str],
    auth_header: Option<&str>,
) -> AppResult<GitOutput> {
    let mut cmd = Command::new("git");
    cmd.current_dir(cwd);
    if let Some(header) = auth_header {
        // `-c` flags must precede the subcommand.
        cmd.arg("-c").arg(format!("http.extraHeader={header}"));
    }
    cmd.args(args);
    for (k, v) in env_base() {
        cmd.env(k, v);
    }
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let output = cmd
        .output()
        .await
        .map_err(|e| AppError::Git(format!("Failed to spawn git: {e}")))?;

    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    let stderr = String::from_utf8_lossy(&output.stderr).into_owned();
    let code = output.status.code().unwrap_or(-1);
    Ok(GitOutput {
        code,
        stdout,
        stderr,
    })
}

/// Run `git` with no working directory (for version checks etc.).
pub async fn run_global(args: &[&str]) -> AppResult<GitOutput> {
    let cwd = std::env::current_dir().map_err(|e| AppError::Git(format!("cwd: {e}")))?;
    run_in(&cwd, args, None).await
}

/// Verify `git` is installed and reachable. Called from the `ping` command.
pub async fn check_git_available() -> AppResult<String> {
    let out = run_global(&["--version"]).await?;
    let version = out
        .require_success("git --version")?
        .trim()
        .to_string();
    Ok(version)
}
