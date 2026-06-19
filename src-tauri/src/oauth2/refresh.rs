//! OAuth2 access-token refresh.
//!
//! `refresh_if_needed` is invoked from `client_for_account` before every API
//! call so expiring OAuth2 tokens renew transparently. PAT accounts never
//! reach this code (the caller checks `auth_method` first).
//!
//! We treat tokens within 5 minutes of expiry as needing refresh (a small
//! skew so we don't race the server clock). If the refresh fails — typically
//! because the refresh token has also expired (default ~30 days) — we surface
//! an auth error prompting re-login.

use crate::error::{AppError, AppResult};
use crate::oauth2::store::{self, now_unix, needs_refresh, read, OauthTokenSet, StoredToken};

/// Refresh skew: if the access token expires within this many seconds, refresh.
const REFRESH_SKEW_SECS: i64 = 300; // 5 minutes

/// Refresh the access token for `account_id` if its OAuth2 token set is
/// near/past expiry. PAT accounts and non-expiring OAuth2 tokens are a no-op.
pub async fn refresh_if_needed(account_id: &str) -> AppResult<()> {
    let stored = read(account_id)?;
    let StoredToken::Oauth(set) = stored else {
        // PAT — nothing to refresh.
        return Ok(());
    };

    if !needs_refresh(&set, REFRESH_SKEW_SECS) {
        return Ok(());
    }

    let Some(refresh_token) = set.refresh_token.as_deref() else {
        // No refresh token issued (rare). Surface a re-login prompt.
        return Err(AppError::Auth(
            "OAuth2 token has expired and no refresh token is available. Please sign in again.".into(),
        ));
    };

    let new_set = do_refresh(&set, refresh_token).await?;
    store::update_oauth(account_id, &new_set)?;
    Ok(())
}

/// POST to `/login/oauth/access_token` with `grant_type=refresh_token` and
/// return an updated token set.
async fn do_refresh(set: &OauthTokenSet, refresh_token: &str) -> AppResult<OauthTokenSet> {
    // Resolve the Gitea base URL — stored on the Account, not the token set.
    // We derive it from the account lookup, but the refresh path only has the
    // account id; the caller (client_for_account) already has the URL. To
    // keep this self-contained, we accept that the token endpoint URL is
    // derived from the redirect_uri's host is wrong — instead we store the
    // base URL on the token set to make refresh hermetic.
    let base = &set.base_url;

    let mut form = vec![
        ("grant_type", "refresh_token"),
        ("refresh_token", refresh_token),
        ("client_id", set.client_id.as_str()),
    ];
    let secret_holder;
    if let Some(secret) = set.client_secret.as_deref() {
        secret_holder = secret.to_string();
        form.push(("client_secret", secret_holder.as_str()));
    }

    let http = reqwest::Client::builder()
        .user_agent(concat!("gitea-desktop/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| AppError::Network(format!("HTTP client build failed: {e}")))?;

    let resp = http
        .post(format!("{base}/login/oauth/access_token"))
        .header("Accept", "application/json")
        .form(&form)
        .send()
        .await?;

    let status = resp.status();
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        // Refresh token expired/revoked → user must re-login.
        return Err(AppError::Auth(format!(
            "OAuth2 session expired — please sign in again. ({})",
            if text.trim().is_empty() {
                status.canonical_reason().unwrap_or("refresh failed").to_string()
            } else {
                text
            }
        )));
    }

    #[derive(serde::Deserialize)]
    struct RefreshResponse {
        access_token: String,
        #[serde(default)]
        refresh_token: Option<String>,
        #[serde(default)]
        expires_in: Option<i64>,
    }
    let r: RefreshResponse = resp.json().await?;

    let expires_in = r.expires_in.unwrap_or(3600);
    Ok(OauthTokenSet {
        access_token: r.access_token,
        // Gitea rotates refresh tokens; prefer the new one, fall back to the old.
        refresh_token: r.refresh_token.or_else(|| set.refresh_token.clone()),
        expires_at: now_unix() + expires_in,
        client_id: set.client_id.clone(),
        client_secret: set.client_secret.clone(),
        redirect_uri: set.redirect_uri.clone(),
        base_url: set.base_url.clone(),
    })
}
