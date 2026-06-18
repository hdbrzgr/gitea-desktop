//! Gitea API v1 client and models.

pub mod client;
pub mod models;

pub use client::Client;
pub use models::User;
#[allow(unused_imports)]
pub use models::{
    Branch, BranchCommit, CreatePullRequest, MergeStyle, PullBranch, PullRequest, Repo, Version,
};
