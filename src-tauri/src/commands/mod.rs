//! Tauri command surface. Each `#[tauri::command]` fn is registered in
//! `lib.rs` via `tauri::generate_handler!` using its full module path.

pub mod account;
pub mod branches;
pub mod gitea_proxy;
pub mod git_ops;
pub mod helpers;
pub mod log;
pub mod oauth;
pub mod open_with;
pub mod ping;
pub mod repo;
pub mod settings;
pub mod submodules;
