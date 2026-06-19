//! Account management commands.
//!
//! Accounts are stored in `AppConfig` (plaintext metadata) with the secret
//! token in the OS keyring. `add_account` validates the token by calling
//! Gitea's `/user` endpoint before persisting.
//!
//! Two auth methods are supported, distinguished by `Account.auth_method`:
//!   - `"pat"`: a personal access token (bare string in the keyring)
//!   - `"oauth"`: an OAuth2 token set (JSON blob in the keyring, auto-refreshed)
//! Both produce an access token used with the `Authorization: token <…>`
//! header, so downstream code (`Client`, `gitea_proxy`, git auth) is unchanged.

use tauri::State;

use crate::config::store::{self, ConfigState};
use crate::error::{AppError, AppResult};
use crate::gitea::{Client, User};
use crate::models::Account;
use crate::oauth2;

/// Inputs for adding a new account via PAT.
#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddAccountInput {
    pub url: String,
    pub token: String,
}

/// Add (or update) an account after verifying the PAT against Gitea.
#[tauri::command]
pub async fn add_account(
    input: AddAccountInput,
    state: State<'_, ConfigState>,
) -> AppResult<Account> {
    // Verify the token by fetching the current user before persisting anything.
    let client = Client::new(&input.url, &input.token)?;
    let user: User = client.get_current_user().await?;

    let account = build_account(&input.url, &user, Some("pat".to_string()));

    // Persist token in keyring first; if that fails, we never record the account.
    oauth2::write_pat(&account.id, &input.token)?;

    persist_account(&state, account)
}

/// List all configured accounts.
#[tauri::command]
pub fn list_accounts(state: State<'_, ConfigState>) -> AppResult<Vec<Account>> {
    state.read(|cfg| Ok(cfg.accounts.clone()))
}

/// Delete an account (and its token).
#[tauri::command]
pub fn remove_account(account_id: String, state: State<'_, ConfigState>) -> AppResult<()> {
    store::delete_token(&account_id)?;
    state.mutate(|cfg| {
        cfg.accounts.retain(|a| a.id != account_id);
        // Detach any repos that belonged to this account.
        for r in cfg.repos.iter_mut() {
            if r.account_id.as_deref() == Some(&account_id) {
                r.account_id = None;
            }
        }
        Ok(())
    })
}

/// Build a stable account id from URL + username.
pub(crate) fn make_account_id(url: &str, username: &str) -> String {
    let host = url::Url::parse(url)
        .ok()
        .and_then(|u| u.host_str().map(String::from))
        .unwrap_or_else(|| url.to_string());
    format!("{username}@{host}")
}

/// Build an `Account` from a verified Gitea user profile.
pub(crate) fn build_account(url: &str, user: &User, auth_method: Option<String>) -> Account {
    Account {
        id: make_account_id(url, &user.login),
        url: url.trim_end_matches('/').to_string(),
        username: user.login.clone(),
        display_name: if user.full_name.is_empty() {
            None
        } else {
            Some(user.full_name.clone())
        },
        avatar_url: if user.avatar_url.is_empty() {
            None
        } else {
            Some(user.avatar_url.clone())
        },
        auth_method,
    }
}

/// Insert (or replace) an account in config and return the stored record.
/// Shared by the PAT and OAuth2 login paths so they produce identical
/// config entries.
pub(crate) fn persist_account(
    state: &State<'_, ConfigState>,
    account: Account,
) -> AppResult<Account> {
    state.mutate(|cfg| {
        // Replace any existing account with the same id.
        cfg.accounts.retain(|a| a.id != account.id);
        cfg.accounts.push(account.clone());
        Ok(account.clone())
    })
}

/// Resolve the access token for an account from the keyring. Works for both
/// PAT (bare string) and OAuth2 (JSON blob) storage shapes.
pub fn token_for(account_id: &str) -> AppResult<String> {
    oauth2::access_token_for(account_id)
}

/// Find an account by id.
pub fn account_by_id<'a>(cfg: &'a crate::models::AppConfig, id: &str) -> Option<&'a Account> {
    cfg.accounts.iter().find(|a| a.id == id)
}

/// Return a constructed `gitea::Client` for the given account id. For OAuth2
/// accounts, transparently refreshes the access token if it's near expiry.
pub async fn client_for_account(
    cfg: &crate::models::AppConfig,
    account_id: &str,
) -> AppResult<Client> {
    let account = account_by_id(cfg, account_id)
        .ok_or_else(|| AppError::NotFound(format!("Account {account_id} not found")))?;

    // OAuth2 accounts: refresh if needed before handing out the client.
    if account.auth_method.as_deref() == Some("oauth") {
        crate::oauth2::refresh::refresh_if_needed(account_id).await?;
    }

    let token = token_for(account_id)?;
    Client::new(&account.url, &token)
}
