//! Proxy commands that resolve an account by id, build a Gitea client with
//! its token, and forward a call to the Gitea API. The frontend never sees
//! tokens — only account ids.

use tauri::State;

use crate::config::store::ConfigState;
use crate::error::AppResult;
use crate::gitea::{Branch, Client, CreatePullRequest, PullRequest, Repo, Version};
use crate::models::LocalRepo;

/// Build a Gitea client for the account. We acquire the config lock only
/// briefly to look up the URL + auth method, then release it before any
/// `.await` so no borrow is held across the (possibly refreshing) call.
async fn make_client(state: &State<'_, ConfigState>, account_id: &str) -> AppResult<Client> {
    let (url, auth_method) = state.read(|cfg| {
        let acc = cfg
            .accounts
            .iter()
            .find(|a| a.id == account_id)
            .ok_or_else(|| {
                crate::error::AppError::NotFound(format!("Account {account_id} not found"))
            })?;
        Ok::<_, crate::error::AppError>((acc.url.clone(), acc.auth_method.clone()))
    })?;

    if auth_method.as_deref() == Some("oauth") {
        crate::oauth2::refresh::refresh_if_needed(account_id).await?;
    }

    let token = crate::commands::account::token_for(account_id)?;
    Client::new(&url, &token)
}

#[tauri::command]
pub async fn get_gitea_version(
    account_id: String,
    state: State<'_, ConfigState>,
) -> AppResult<Version> {
    let client = make_client(&state, &account_id).await?;
    client.get_version().await
}

#[tauri::command]
pub async fn list_my_repos(
    account_id: String,
    page: Option<i32>,
    limit: Option<i32>,
    state: State<'_, ConfigState>,
) -> AppResult<Vec<Repo>> {
    let client = make_client(&state, &account_id).await?;
    client
        .list_my_repos(page.unwrap_or(1), limit.unwrap_or(50))
        .await
}

#[tauri::command]
pub async fn search_repos(
    account_id: String,
    query: String,
    page: Option<i32>,
    limit: Option<i32>,
    state: State<'_, ConfigState>,
) -> AppResult<Vec<Repo>> {
    let client = make_client(&state, &account_id).await?;
    client
        .search_repos(&query, page.unwrap_or(1), limit.unwrap_or(50))
        .await
}

#[tauri::command]
pub async fn get_repo(
    account_id: String,
    owner: String,
    repo: String,
    state: State<'_, ConfigState>,
) -> AppResult<Repo> {
    let client = make_client(&state, &account_id).await?;
    client.get_repo(&owner, &repo).await
}

#[tauri::command]
pub async fn list_remote_branches(
    account_id: String,
    owner: String,
    repo: String,
    state: State<'_, ConfigState>,
) -> AppResult<Vec<Branch>> {
    let client = make_client(&state, &account_id).await?;
    client.list_branches(&owner, &repo).await
}

#[tauri::command]
pub async fn list_pulls(
    account_id: String,
    owner: String,
    repo: String,
    state: Option<String>,
    cfg_state: State<'_, ConfigState>,
) -> AppResult<Vec<PullRequest>> {
    let client = make_client(&cfg_state, &account_id).await?;
    client
        .list_pulls(&owner, &repo, state.as_deref().unwrap_or("open"))
        .await
}

/// Body for creating a pull request, matching the frontend's `CreatePullInput`.
#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePullBody {
    pub owner: String,
    pub repo: String,
    pub title: String,
    pub body: Option<String>,
    pub head: String,
    pub base: String,
}

#[tauri::command]
pub async fn create_pull(
    account_id: String,
    input: CreatePullBody,
    state: State<'_, ConfigState>,
) -> AppResult<PullRequest> {
    let client = make_client(&state, &account_id).await?;
    let body = CreatePullRequest {
        title: input.title,
        body: input.body,
        base: input.base,
        head: input.head,
        assignee: None,
    };
    client.create_pull(&input.owner, &input.repo, body).await
}

#[tauri::command]
pub async fn merge_pull(
    account_id: String,
    owner: String,
    repo: String,
    index: i64,
    style: Option<String>,
    state: State<'_, ConfigState>,
) -> AppResult<()> {
    let client = make_client(&state, &account_id).await?;
    let do_ = match style.as_deref().unwrap_or("merge") {
        "squash" => "squash",
        "rebase" => "rebase",
        "rebase-merge" => "rebase-merge",
        _ => "merge",
    };
    client.merge_pull(&owner, &repo, index, do_).await
}

/// Resolve the (account_id, owner, repo) triple for a local repo, used by
/// PR/branch commands so the frontend only passes a repo id.
pub fn remote_for_repo<'a>(
    cfg: &'a crate::models::AppConfig,
    repo_id: &str,
) -> Option<(&'a LocalRepo, &'a str, &'a str)> {
    let repo = cfg.repos.iter().find(|r| r.id == repo_id)?;
    let account_id = repo.account_id.as_ref()?;
    let full = repo.full_name.as_ref()?;
    let (owner, name) = full.split_once('/')?;
    // confirm the account exists
    if !cfg.accounts.iter().any(|a| &a.id == account_id) {
        return None;
    }
    Some((repo, owner, name))
}
