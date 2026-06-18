//! Cross-cutting data models shared between modules and serialized to the frontend.
//!
//! These are deliberately kept as plain `Serialize`/`Deserialize` structs.
//! `snake_case` is used throughout; the frontend invokes commands with
//! `camelCase` args but reads responses as-is, and these field names match
//! the TypeScript interfaces in `src/api/types.ts` exactly.

use serde::{Deserialize, Serialize};

/// A configured Gitea account. The token itself is stored in the OS keyring
/// and is *not* part of this struct (so it never gets written to the plain
/// JSON config file or logged).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Account {
    /// Unique id (a UUID-ish string).
    pub id: String,
    /// Base URL of the Gitea instance, e.g. `https://gitea.example.com`.
    /// Stored without a trailing slash.
    pub url: String,
    /// The username the token belongs to.
    pub username: String,
    /// Display name from the Gitea user profile, if known.
    pub display_name: Option<String>,
    /// Avatar URL, if known.
    pub avatar_url: Option<String>,
}

/// A local working copy tracked by the app.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalRepo {
    pub id: String,
    /// Absolute filesystem path to the repo working directory.
    pub path: String,
    /// A friendly display name (usually the directory name).
    pub name: String,
    /// Host this repo's remote points to (for account matching), if known.
    pub host: Option<String>,
    /// `owner/repo` on the remote, if known.
    pub full_name: Option<String>,
    /// Account id matched by `host`, if any.
    pub account_id: Option<String>,
}

/// Persisted application state. Written to `<app_data_dir>/config.json`.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AppConfig {
    pub accounts: Vec<Account>,
    pub repos: Vec<LocalRepo>,
}
