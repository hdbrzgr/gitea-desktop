//! Gitea Desktop — Tauri core.
//!
//! The frontend never spawns git or calls Gitea directly; every operation
//! goes through one of the commands registered here.

// Many modules/fields are defined ahead of being wired into commands in
// later phases; suppress dead-code noise until then.
#![allow(dead_code)]

mod commands;
mod config;
mod error;
mod git;
mod gitea;
mod models;

use config::store::{load_config, ConfigState};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Load persisted config (accounts + repos) into app state.
            let config = load_config().unwrap_or_default();
            app.manage(ConfigState::new(config));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::ping::ping_git,
            commands::account::add_account,
            commands::account::list_accounts,
            commands::account::remove_account,
            commands::gitea_proxy::get_gitea_version,
            commands::gitea_proxy::list_my_repos,
            commands::gitea_proxy::search_repos,
            commands::gitea_proxy::get_repo,
            commands::gitea_proxy::list_remote_branches,
            commands::gitea_proxy::list_pulls,
            commands::gitea_proxy::create_pull,
            commands::gitea_proxy::merge_pull,
            commands::repo::clone_repo,
            commands::repo::add_local_repo,
            commands::repo::detect_remote_info,
            commands::repo::list_local_repos,
            commands::repo::remove_repo,
            commands::repo::reveal_in_finder,
            commands::git_ops::git_status,
            commands::git_ops::git_diff,
            commands::git_ops::git_stage,
            commands::git_ops::git_unstage,
            commands::git_ops::git_discard,
            commands::git_ops::git_commit,
            commands::git_ops::git_fetch,
            commands::git_ops::git_pull,
            commands::git_ops::git_push,
            commands::branches::list_branches,
            commands::branches::create_branch,
            commands::branches::checkout_branch,
            commands::branches::delete_branch,
            commands::branches::rename_branch,
            commands::log::git_log,
            commands::log::git_commit_info,
            commands::log::git_commit_files,
            commands::log::git_commit_file_diff,
            commands::submodules::list_submodules,
            commands::submodules::init_submodules,
            commands::submodules::update_submodules,
            commands::submodules::sync_submodules,
            commands::submodules::fetch_submodule_updates,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
