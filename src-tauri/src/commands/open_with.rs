//! "Open with" commands: open a repo (or submodule) working directory in an
//! external application — Terminal, VS Code, Cursor, or the system file
//! manager (Finder on macOS).
//!
//! On macOS we use `open -a <App>` which launches the named application; the
//! app id is resolved against `/Applications` and `~/Applications`. For
//! Terminal we use `open -a Terminal <dir>`. For the file manager we use the
//! opener plugin (which maps to Finder).
//!
//! `detect_apps` probes which apps are installed so the UI can show only the
//! ones the user actually has.

use std::path::Path;

use serde::{Deserialize, Serialize};
use tauri::State;
use tauri_plugin_opener::OpenerExt;

use crate::commands::helpers::repo_workdir;
use crate::config::store::ConfigState;
use crate::error::{AppError, AppResult};

/// The apps we can open a repo with. The string values are the identifiers
/// the frontend sends; keep them stable.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum OpenTarget {
    Terminal,
    Vscode,
    Cursor,
    Finder,
    Zed,
}

/// Where an app was found (so the UI can show a friendly label) — or that it
/// isn't installed.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppAvailability {
    pub target: OpenTarget,
    /// Human-readable name for the menu, e.g. "VS Code", "Cursor".
    pub label: String,
    pub available: bool,
}

/// Probe which "open with" targets are installed on this machine.
#[tauri::command]
pub fn detect_open_apps() -> Vec<AppAvailability> {
    let candidates = [
        (OpenTarget::Terminal, "Terminal".to_string()),
        (OpenTarget::Vscode, "Visual Studio Code".to_string()),
        (OpenTarget::Cursor, "Cursor".to_string()),
        (OpenTarget::Zed, "Zed".to_string()),
        (OpenTarget::Finder, "Finder".to_string()),
    ];

    candidates
        .into_iter()
        .map(|(target, label)| {
            let available = match target {
                // Terminal and Finder always exist on macOS.
                OpenTarget::Terminal | OpenTarget::Finder => true,
                // Editors: check the conventional install locations.
                OpenTarget::Vscode => app_exists("Visual Studio Code.app")
                    || cli_exists("code"),
                OpenTarget::Cursor => app_exists("Cursor.app") || cli_exists("cursor"),
                OpenTarget::Zed => app_exists("Zed.app") || cli_exists("zed"),
            };
            AppAvailability {
                target,
                label,
                available,
            }
        })
        .collect()
}

/// Open the repo (or a submodule) working directory in the chosen app.
#[tauri::command]
pub async fn open_with(
    repo_id: String,
    target: OpenTarget,
    sub_path: Option<String>,
    app: tauri::AppHandle,
    state: State<'_, ConfigState>,
) -> AppResult<()> {
    let dir = repo_workdir(&state, &repo_id, sub_path.as_deref())?;
    if !dir.is_dir() {
        return Err(AppError::NotFound(format!(
            "Directory does not exist: {}",
            dir.display()
        )));
    }
    let dir_str = dir.to_string_lossy().to_string();

    match target {
        OpenTarget::Finder => {
            // Reveal in the OS file manager.
            app.opener()
                .open_path(dir_str, None::<&str>)
                .map_err(|e| AppError::Other(format!("Failed to open Finder: {e}")))?;
        }
        OpenTarget::Terminal => {
            open_terminal(&dir)?;
        }
        OpenTarget::Vscode => {
            open_editor(&dir, "Visual Studio Code", "code")?;
        }
        OpenTarget::Cursor => {
            open_editor(&dir, "Cursor", "cursor")?;
        }
        OpenTarget::Zed => {
            open_editor(&dir, "Zed", "zed")?;
        }
    }
    Ok(())
}

/// Open a new Terminal window at `dir` (macOS). Uses AppleScript via `osascript`
/// so we get a fresh window cd'd into the directory, instead of just opening
/// the Terminal app generically.
fn open_terminal(dir: &Path) -> AppResult<()> {
    let dir_str = dir.to_string_lossy().replace('\\', "\\\\").replace('"', "\\\"");
    // `tell application "Terminal" to do script "cd ..."` opens a new window.
    let script = format!(
        "tell application \"Terminal\"\n\
         activate\n\
         do script \"cd \\\"{dir_str}\\\"\"\n\
         end tell"
    );
    let status = std::process::Command::new("osascript")
        .arg("-e")
        .arg(&script)
        .status()
        .map_err(|e| AppError::Other(format!("Failed to launch osascript: {e}")))?;
    if !status.success() {
        return Err(AppError::Other("Terminal launch failed".into()));
    }
    Ok(())
}

/// Open `dir` in an editor — prefer the CLI (e.g. `code`, `cursor`, `zed`)
/// because it reliably opens a new window at the path; fall back to
/// `open -a <App>.app <dir>` for app-bundle-only installs.
fn open_editor(dir: &Path, app_name: &str, cli: &str) -> AppResult<()> {
    // Try the CLI first (faster, opens a new window at the path).
    if cli_exists(cli) {
        let status = std::process::Command::new(cli)
            .arg(dir)
            .status()
            .map_err(|e| AppError::Other(format!("Failed to run {cli}: {e}")))?;
        if status.success() {
            return Ok(());
        }
    }
    // Fall back to `open -a <App>.app <dir>`.
    let app_bundle = format!("{app_name}.app");
    if app_exists(&app_bundle) {
        let status = std::process::Command::new("open")
            .args(["-a", &app_bundle])
            .arg(dir)
            .status()
            .map_err(|e| AppError::Other(format!("Failed to open {app_name}: {e}")))?;
        if status.success() {
            return Ok(());
        }
    }
    Err(AppError::NotFound(format!(
        "{app_name} is not installed. Install it or add its CLI to your PATH."
    )))
}

/// True if an application bundle exists in the conventional macOS locations.
fn app_exists(name: &str) -> bool {
    let home = dirs::home_dir();
    let mut locations = vec![Path::new("/Applications").join(name)];
    if let Some(h) = &home {
        locations.push(h.join("Applications").join(name));
    }
    locations.iter().any(|p| p.exists())
}

/// True if a command exists on PATH.
fn cli_exists(name: &str) -> bool {
    which::which(name).is_ok()
}
