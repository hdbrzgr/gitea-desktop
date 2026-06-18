//! Application-wide error type.
//!
//! Every Tauri command returns `Result<T, AppError>`. Because `AppError`
//! implements `Serialize`, the frontend receives a structured error object
//! instead of an opaque string, which makes displaying friendly messages
//! straightforward.

use serde::{Serialize, Serializer};
use thiserror::Error;

/// A single error emitted by the Rust core and forwarded to the frontend.
///
/// The serialized form is `{ kind: string, message: string }`. The frontend
/// can switch on `kind` to choose messaging (e.g. show a login prompt for
/// `Auth` errors).
#[derive(Debug, Error)]
pub enum AppError {
    #[error("Authentication failed: {0}")]
    Auth(String),

    #[error("Network error talking to Gitea: {0}")]
    Network(String),

    #[error("Gitea API error ({status}): {message}")]
    Api { status: u16, message: String },

    #[error("Git error: {0}")]
    Git(String),

    #[error("Configuration error: {0}")]
    Config(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("{0}")]
    Other(String),
}

impl AppError {
    pub fn other(msg: impl Into<String>) -> Self {
        Self::Other(msg.into())
    }

    /// Short machine-readable label for the error variant.
    pub fn kind(&self) -> &'static str {
        match self {
            AppError::Auth(_) => "auth",
            AppError::Network(_) => "network",
            AppError::Api { .. } => "api",
            AppError::Git(_) => "git",
            AppError::Config(_) => "config",
            AppError::NotFound(_) => "not_found",
            AppError::Other(_) => "other",
        }
    }
}

impl From<reqwest::Error> for AppError {
    fn from(err: reqwest::Error) -> Self {
        if err.is_connect() || err.is_timeout() {
            AppError::Network(err.to_string())
        } else {
            AppError::Other(format!("HTTP error: {err}"))
        }
    }
}

impl From<serde_json::Error> for AppError {
    fn from(err: serde_json::Error) -> Self {
        AppError::Other(format!("Failed to parse JSON: {err}"))
    }
}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        AppError::Other(format!("IO error: {err}"))
    }
}

impl From<keyring::Error> for AppError {
    fn from(err: keyring::Error) -> Self {
        AppError::Config(format!("Keyring error: {err}"))
    }
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut state = serializer.serialize_struct("AppError", 2)?;
        state.serialize_field("kind", self.kind())?;
        state.serialize_field("message", &self.to_string())?;
        state.end()
    }
}

pub type AppResult<T> = Result<T, AppError>;
