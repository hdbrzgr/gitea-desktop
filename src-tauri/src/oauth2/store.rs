//! OAuth2 token storage.
//!
//! PAT accounts store a bare token string in the keyring (the existing
//! behavior). OAuth2 accounts store a JSON-serialized [`OauthTokenSet`] so we
//! have everything needed to refresh: access token, refresh token, expiry,
//! and the client credentials used for the original exchange.
//!
//! To keep the keyring entries backward-compatible, `StoredToken` is an
//! enum. When we read a keyring entry we first try to parse it as JSON (the
//! OAuth2 blob shape); if that fails we treat the raw string as a PAT.

use serde::{Deserialize, Serialize};

use crate::config::store;
use crate::error::{AppError, AppResult};

/// The full token material persisted for an OAuth2 account.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OauthTokenSet {
    pub access_token: String,
    /// None if the server didn't issue one (rare, but possible).
    pub refresh_token: Option<String>,
    /// Unix timestamp (seconds) when the access token expires.
    pub expires_at: i64,
    pub client_id: String,
    /// Present only for confidential clients.
    pub client_secret: Option<String>,
    /// The exact redirect_uri used in the authorize request (must match on
    /// refresh requests too, per Gitea's strict matching).
    pub redirect_uri: String,
    /// The Gitea instance base URL (no trailing slash) — kept on the token
    /// set so the refresh flow is self-contained (no config lookup needed).
    pub base_url: String,
}

/// Marker embedded in the JSON blob so we can unambiguously tell it apart
/// from a plain PAT string (defense in depth — the struct shape would also
/// work, but this is explicit).
const OAUTH_BLOB_TAG: &str = "__gitea_desktop_oauth__";

#[derive(Serialize, Deserialize)]
struct TaggedBlob {
    tag: String,
    #[serde(flatten)]
    set: OauthTokenSet,
}

/// What we read out of the keyring for an account.
pub enum StoredToken {
    Pat(String),
    Oauth(OauthTokenSet),
}

impl StoredToken {
    /// The access token, regardless of auth method. This is the value that
    /// becomes the `Authorization: token <…>` header.
    pub fn access_token(&self) -> &str {
        match self {
            StoredToken::Pat(t) => t,
            StoredToken::Oauth(s) => &s.access_token,
        }
    }
}

/// Read a stored token (PAT or OAuth2 blob) from the keyring.
pub fn read(account_id: &str) -> AppResult<StoredToken> {
    let raw = store::get_token(account_id)?;
    // Try JSON blob first.
    if let Ok(tagged) = serde_json::from_str::<TaggedBlob>(&raw) {
        if tagged.tag == OAUTH_BLOB_TAG {
            return Ok(StoredToken::Oauth(tagged.set));
        }
    }
    // Fall back to a plain PAT string.
    Ok(StoredToken::Pat(raw))
}

/// Store an OAuth2 token set (JSON blob) in the keyring.
pub fn write_oauth(account_id: &str, set: &OauthTokenSet) -> AppResult<()> {
    let tagged = TaggedBlob {
        tag: OAUTH_BLOB_TAG.to_string(),
        set: set.clone(),
    };
    let json = serde_json::to_string(&tagged)?;
    store::store_token(account_id, &json)
}

/// Store a plain PAT string (existing behavior, exposed here for symmetry).
pub fn write_pat(account_id: &str, token: &str) -> AppResult<()> {
    store::store_token(account_id, token)
}

/// Read only the access token for an account, as a convenience for callers
/// that don't care about the auth method (e.g. git auth header injection).
pub fn access_token_for(account_id: &str) -> AppResult<String> {
    Ok(read(account_id)?.access_token().to_string())
}

/// Is the access token for this OAuth2 set close to or past expiry?
/// Treats tokens within `skew_secs` of expiry as needing refresh.
pub fn needs_refresh(set: &OauthTokenSet, skew_secs: i64) -> bool {
    let now = now_unix();
    set.expires_at - now < skew_secs
}

/// Current Unix timestamp in seconds.
pub fn now_unix() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// Update the stored token set for an account (used after a successful
/// refresh). Reads, replaces, writes. Errors if the account isn't OAuth2.
pub fn update_oauth(account_id: &str, new_set: &OauthTokenSet) -> AppResult<()> {
    match read(account_id)? {
        StoredToken::Oauth(_) => write_oauth(account_id, new_set),
        StoredToken::Pat(_) => Err(AppError::Auth(
            "Cannot update a PAT-backed account as OAuth2".into(),
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn oauth_blob_round_trips_and_reads_back_as_oauth() {
        // We can't touch the real keyring in a unit test, but we can verify
        // the serialization tagging works.
        let set = OauthTokenSet {
            access_token: "atk".into(),
            refresh_token: Some("rtk".into()),
            expires_at: 1_700_000_000,
            client_id: "cid".into(),
            client_secret: None,
            redirect_uri: "http://127.0.0.1:1/callback".into(),
            base_url: "https://gitea.example.com".into(),
        };
        let tagged = TaggedBlob {
            tag: OAUTH_BLOB_TAG.into(),
            set: set.clone(),
        };
        let json = serde_json::to_string(&tagged).unwrap();
        let back: TaggedBlob = serde_json::from_str(&json).unwrap();
        assert_eq!(back.tag, OAUTH_BLOB_TAG);
        assert_eq!(back.set.access_token, set.access_token);
    }

    #[test]
    fn needs_refresh_when_close_to_expiry() {
        let now = now_unix();
        let expiring = OauthTokenSet {
            access_token: "x".into(),
            refresh_token: None,
            expires_at: now + 60,
            client_id: "c".into(),
            client_secret: None,
            redirect_uri: "u".into(),
            base_url: "https://gitea.example.com".into(),
        };
        assert!(needs_refresh(&expiring, 300)); // 60s left, 5min skew → refresh
    }
}
