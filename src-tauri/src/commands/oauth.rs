//! OAuth2 login command — drives the full authorization-code flow from a
//! single frontend `invoke`.
//!
//! Flow (all server-side; the frontend just kicks it off and awaits the
//! resulting `Account`):
//!   1. Generate PKCE verifier + CSRF state.
//!   2. Spawn a one-shot loopback HTTP server to capture the callback.
//!   3. Open the system browser to Gitea's `/login/oauth/authorize` URL.
//!   4. On callback: exchange the code at `/login/oauth/access_token`.
//!   5. Verify by calling `/api/v1/user`, then store the token set + account.

use serde::Deserialize;
use tauri::State;
use tauri_plugin_opener::OpenerExt;

use crate::commands::account::{build_account, persist_account};
use crate::config::store::ConfigState;
use crate::error::{AppError, AppResult};
use crate::gitea::{Client, User};
use crate::oauth2::{
    gen_challenge, gen_state, gen_verifier,
    server::{spawn as spawn_callback_server, CallbackOutcome},
    store::OauthTokenSet,
    write_oauth,
};

/// Inputs for an OAuth2 login. `client_secret` is None/blank for public
/// (PKCE) clients; present for confidential clients.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OauthLoginInput {
    /// Base URL of the Gitea instance, e.g. https://gitea.example.com
    pub url: String,
    /// OAuth2 application client_id.
    pub client_id: String,
    /// OAuth2 application client_secret. Leave empty for public clients.
    pub client_secret: Option<String>,
}

/// Token response from Gitea's `/login/oauth/access_token`.
#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
    #[serde(default)]
    refresh_token: Option<String>,
    #[serde(default)]
    expires_in: Option<i64>,
    #[serde(default, rename = "token_type")]
    _token_type: Option<String>,
}

/// Run the OAuth2 authorization-code flow and return the resulting account.
#[tauri::command]
pub async fn start_oauth_login(
    input: OauthLoginInput,
    app: tauri::AppHandle,
    state: State<'_, ConfigState>,
) -> AppResult<crate::models::Account> {
    let base = input.url.trim_end_matches('/').to_string();

    // PKCE + state (CSRF). PKCE is used for public clients; for confidential
    // clients we still send the challenge (harmless) but the secret is what
    // actually authenticates the exchange.
    let verifier = gen_verifier();
    let challenge = gen_challenge(&verifier);
    let csrf_state = gen_state();

    // Spin up the loopback callback server.
    let (port, rx) = spawn_callback_server(csrf_state.clone()).await?;
    // Gitea registers the redirect URI as `http://127.0.0.1/` (root path, any
    // port per RFC 8252). It matches the PATH exactly (ignoring port), so we
    // must use the root path here — NOT `/callback`. See Gitea OAuth2 docs.
    let redirect_uri = format!("http://127.0.0.1:{port}/");

    // Build the authorize URL.
    let mut authorize_url = format!(
        "{base}/login/oauth/authorize?response_type=code&client_id={cid}&redirect_uri={ru}&state={st}&code_challenge_method=S256&code_challenge={ch}&scope=read:user%20write:repository",
        cid = urlencoding::encode(&input.client_id),
        ru = urlencoding::encode(&redirect_uri),
        st = csrf_state,
        ch = challenge,
    );
    // Confidential clients send the secret at exchange time, not here.
    let _ = &mut authorize_url;

    // Open the system browser.
    app.opener()
        .open_url(&authorize_url, None::<&str>)
        .map_err(|e| AppError::Other(format!("Failed to open browser: {e}")))?;

    // Wait for the callback (with the server's own 5-min timeout).
    let outcome = rx
        .await
        .map_err(|_| AppError::Other("Callback channel closed".into()))?;

    let code = match outcome {
        CallbackOutcome::Success { code, .. } => code,
        CallbackOutcome::Error(msg) => return Err(AppError::Auth(msg)),
    };

    // Exchange the code for tokens.
    let token_set = exchange_code(
        &base,
        &input.client_id,
        input.client_secret.as_deref(),
        &code,
        &redirect_uri,
        &verifier,
    )
    .await?;

    // Verify the token by fetching the user profile (mirrors the PAT path).
    let client = Client::new(&base, &token_set.access_token)?;
    let user: User = client.get_current_user().await?;

    let account = build_account(&base, &user, Some("oauth".to_string()));

    // Store the OAuth2 token set in the keyring, then persist the account.
    write_oauth(&account.id, &token_set)?;
    persist_account(&state, account)
}

/// POST to `/login/oauth/access_token` and return a stored token set.
async fn exchange_code(
    base: &str,
    client_id: &str,
    client_secret: Option<&str>,
    code: &str,
    redirect_uri: &str,
    code_verifier: &str,
) -> AppResult<OauthTokenSet> {
    let mut form = vec![
        ("grant_type", "authorization_code"),
        ("client_id", client_id),
        ("code", code),
        ("redirect_uri", redirect_uri),
        ("code_verifier", code_verifier),
    ];
    let secret_holder;
    if let Some(secret) = client_secret {
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
        let msg = serde_json::from_str::<serde_json::Value>(&text)
            .ok()
            .and_then(|v| {
                v.get("message")
                    .or_else(|| v.get("error"))
                    .and_then(|m| m.as_str())
                    .map(String::from)
            })
            .unwrap_or_else(|| {
                if text.trim().is_empty() {
                    status.canonical_reason().unwrap_or("Token exchange failed").to_string()
                } else {
                    text
                }
            });
        // A common cause is OAuth2 being disabled on the instance.
        if status.as_u16() == 404 || status.as_u16() == 400 {
            return Err(AppError::Auth(format!(
                "{msg}\n\nOAuth2 may be disabled on this Gitea instance, or the client_id/redirect_uri is wrong. You can also sign in with a personal access token."
            )));
        }
        return Err(AppError::Auth(msg));
    }

    let token: TokenResponse = resp.json().await?;

    let expires_in = token.expires_in.unwrap_or(3600);
    let expires_at = crate::oauth2::store::now_unix() + expires_in;

    Ok(OauthTokenSet {
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        expires_at,
        client_id: client_id.to_string(),
        client_secret: client_secret.map(|s| s.to_string()),
        redirect_uri: redirect_uri.to_string(),
        base_url: base.to_string(),
    })
}
