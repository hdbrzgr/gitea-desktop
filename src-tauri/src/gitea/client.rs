//! Gitea API v1 HTTP client.
//!
//! One `Client` is constructed per request, holding the base URL and token.
//! All requests inject the non-standard `Authorization: token <TOKEN>` header
//! that Gitea requires (NOT `Bearer`). Pagination follows Gitea's convention
//! of `page` (1-indexed) and `limit` (max 50).

use reqwest::{Client as HttpClient, StatusCode};
use serde::de::DeserializeOwned;

use crate::error::{AppError, AppResult};

use super::models::{
    Branch, CreatePullRequest, PullRequest, Repo, SearchReposResponse, User, Version,
};

/// Wraps a base URL + token and exposes typed Gitea API calls.
pub struct Client {
    base: String,
    token: String,
    http: HttpClient,
}

impl Client {
    pub fn new(base_url: &str, token: &str) -> AppResult<Self> {
        // Normalize: strip trailing slash so `format!("{}/api/v1/...")` is clean.
        let base = base_url.trim_end_matches('/').to_string();
        let http = HttpClient::builder()
            .user_agent(concat!("gitea-desktop/", env!("CARGO_PKG_VERSION")))
            .build()
            .map_err(|e| AppError::Network(format!("Failed to build HTTP client: {e}")))?;
        Ok(Self {
            base,
            token: token.to_string(),
            http,
        })
    }

    /// Construct a `GET` request with the auth header already applied.
    fn get(&self, path: &str) -> reqwest::RequestBuilder {
        let url = format!("{}{}", self.base, path);
        self.http
            .get(url)
            .header("Authorization", format!("token {}", self.token))
            .header("Accept", "application/json")
    }

    /// Construct a `POST` request with the auth header applied.
    fn post(&self, path: &str) -> reqwest::RequestBuilder {
        let url = format!("{}{}", self.base, path);
        self.http
            .post(url)
            .header("Authorization", format!("token {}", self.token))
            .header("Accept", "application/json")
    }

    /// Send a request and deserialize the JSON body, mapping non-2xx to
    /// `AppError::Api` with the server's error message when available.
    async fn send_json<T: DeserializeOwned>(&self, req: reqwest::RequestBuilder) -> AppResult<T> {
        let resp = req.send().await?;
        let status = resp.status();
        if status.is_success() {
            Ok(resp.json::<T>().await?)
        } else {
            // Try to extract Gitea's `{ "message": "..." }` error payload.
            let text = resp.text().await.unwrap_or_default();
            let message = serde_json::from_str::<serde_json::Value>(&text)
                .ok()
                .and_then(|v| v.get("message").and_then(|m| m.as_str()).map(String::from))
                .unwrap_or_else(|| {
                    if text.trim().is_empty() {
                        status.canonical_reason().unwrap_or("Unknown error").to_string()
                    } else {
                        text
                    }
                });
            if status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN {
                Err(AppError::Auth(message))
            } else if status == StatusCode::NOT_FOUND {
                Err(AppError::NotFound(message))
            } else {
                Err(AppError::Api {
                    status: status.as_u16(),
                    message,
                })
            }
        }
    }

    // --- Account / user -----------------------------------------------------

    pub async fn get_current_user(&self) -> AppResult<User> {
        self.send_json(self.get("/api/v1/user")).await
    }

    pub async fn get_version(&self) -> AppResult<Version> {
        self.send_json(self.get("/api/v1/version")).await
    }

    // --- Repositories -------------------------------------------------------

    /// Repos visible to / owned by the authenticated user.
    pub async fn list_my_repos(&self, page: i32, limit: i32) -> AppResult<Vec<Repo>> {
        self.send_json(
            self.get("/api/v1/user/repos")
                .query(&[("page", &page.to_string()), ("limit", &limit.to_string())]),
        )
        .await
    }

    /// Instance-wide repo search.
    pub async fn search_repos(
        &self,
        query: &str,
        page: i32,
        limit: i32,
    ) -> AppResult<Vec<Repo>> {
        let resp: SearchReposResponse = self
            .send_json(
                self.get("/api/v1/repos/search").query(&[
                    ("q", query),
                    ("page", &page.to_string()),
                    ("limit", &limit.to_string()),
                ]),
            )
            .await?;
        Ok(resp.data)
    }

    pub async fn get_repo(&self, owner: &str, repo: &str) -> AppResult<Repo> {
        self.send_json(self.get(&format!("/api/v1/repos/{owner}/{repo}")))
            .await
    }

    // --- Branches -----------------------------------------------------------

    pub async fn list_branches(&self, owner: &str, repo: &str) -> AppResult<Vec<Branch>> {
        self.send_json(self.get(&format!(
            "/api/v1/repos/{owner}/{repo}/branches"
        )))
        .await
    }

    // --- Pull requests ------------------------------------------------------

    pub async fn list_pulls(
        &self,
        owner: &str,
        repo: &str,
        state: &str,
    ) -> AppResult<Vec<PullRequest>> {
        let limit = "50".to_string();
        self.send_json(
            self.get(&format!("/api/v1/repos/{owner}/{repo}/pulls"))
                .query(&[("state", state), ("limit", limit.as_str())]),
        )
        .await
    }

    pub async fn get_pull(&self, owner: &str, repo: &str, index: i64) -> AppResult<PullRequest> {
        self.send_json(self.get(&format!(
            "/api/v1/repos/{owner}/{repo}/pulls/{index}"
        )))
        .await
    }

    pub async fn create_pull(
        &self,
        owner: &str,
        repo: &str,
        body: CreatePullRequest,
    ) -> AppResult<PullRequest> {
        self.send_json(self.post(&format!("/api/v1/repos/{owner}/{repo}/pulls")).json(&body))
            .await
    }

    pub async fn merge_pull(
        &self,
        owner: &str,
        repo: &str,
        index: i64,
        do_: &str,
    ) -> AppResult<()> {
        let resp = self
            .post(&format!("/api/v1/repos/{owner}/{repo}/pulls/{index}/merge"))
            .header("Content-Type", "application/json")
            .body(format!("{{\"Do\":\"{do_}\"}}"))
            .send()
            .await?;
        if resp.status().is_success() {
            Ok(())
        } else {
            let status = resp.status().as_u16();
            let message = resp.text().await.unwrap_or_default();
            Err(AppError::Api { status, message })
        }
    }
}
