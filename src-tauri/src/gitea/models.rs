//! Typed Gitea API v1 response models.
//!
//! Field names mirror the Gitea API JSON exactly. We only include the fields
//! the app actually reads — `#[serde(default)]` keeps deserialization
//! resilient when Gitea adds or omits fields across versions.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct User {
    #[serde(default)]
    pub login: String,
    #[serde(default)]
    pub id: i64,
    #[serde(default)]
    pub full_name: String,
    #[serde(default)]
    pub email: String,
    #[serde(default)]
    pub avatar_url: String,
    #[serde(default)]
    pub username: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Repo {
    #[serde(default)]
    pub id: i64,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub full_name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub private: bool,
    #[serde(default)]
    pub fork: bool,
    #[serde(default)]
    pub empty: bool,
    #[serde(default)]
    pub archive: bool,
    #[serde(default)]
    pub html_url: String,
    #[serde(default)]
    pub ssh_url: String,
    #[serde(default)]
    pub clone_url: String,
    #[serde(default)]
    pub default_branch: String,
    #[serde(default)]
    pub stars_count: i64,
    #[serde(default)]
    pub forks_count: i64,
    #[serde(default)]
    pub watchers_count: i64,
    #[serde(default)]
    pub open_issues_count: i64,
    pub owner: Option<User>,
    pub updated_at: Option<String>,
}

/// Gitea's `/repos/search` wraps the array in `{ ok, data }`.
#[derive(Debug, Clone, Deserialize)]
pub struct SearchReposResponse {
    #[serde(default)]
    pub ok: bool,
    pub data: Vec<Repo>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Branch {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub commit: BranchCommit,
    #[serde(default)]
    pub protected: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct BranchCommit {
    #[serde(default)]
    pub id: String,
    #[serde(default, rename = "timestamp")]
    pub timestamp: String,
    #[serde(default)]
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PullRequest {
    #[serde(default)]
    pub id: i64,
    #[serde(default)]
    pub number: i64,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub body: String,
    #[serde(default)]
    pub state: String,
    #[serde(default)]
    pub mergeable: bool,
    #[serde(default)]
    pub merged: bool,
    #[serde(default)]
    pub user: Option<User>,
    #[serde(default)]
    pub html_url: String,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
    pub head: Option<PullBranch>,
    pub base: Option<PullBranch>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PullBranch {
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub r#ref: String,
    #[serde(default)]
    pub sha: String,
    #[serde(default)]
    pub repo: Option<Repo>,
}

/// Body for `POST /repos/{owner}/{repo}/pulls`.
#[derive(Debug, Clone, Serialize)]
pub struct CreatePullRequest {
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
    /// `base` is the destination branch (e.g. "main").
    pub base: String,
    /// `head` is the source: just "branch" if same repo, "owner:branch" for forks.
    pub head: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub assignee: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Version {
    #[serde(default)]
    pub version: String,
}

/// Merge style for `POST /repos/{owner}/{repo}/pulls/{index}/merge`.
#[derive(Debug, Clone, Copy)]
pub enum MergeStyle {
    Merge,
    Squash,
    Rebase,
    RebaseMerge,
    ManuallyMerged,
}

impl MergeStyle {
    pub fn as_str(&self) -> &'static str {
        match self {
            MergeStyle::Merge => "merge",
            MergeStyle::Squash => "squash",
            MergeStyle::Rebase => "rebase",
            MergeStyle::RebaseMerge => "rebase-merge",
            MergeStyle::ManuallyMerged => "manually-merged",
        }
    }
}
