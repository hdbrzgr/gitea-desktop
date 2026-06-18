/**
 * Typed wrappers around Tauri `invoke`. Components and hooks import from this
 * module instead of calling `invoke` directly, so the IPC contract lives in
 * one place and argument names stay camelCase (Tauri converts to the Rust
 * snake_case parameters automatically).
 *
 * Each function maps 1:1 to a `#[tauri::command]` in `src-tauri/src/commands/`.
 */
import { invoke } from "@tauri-apps/api/core";
import type {
  Account,
  GiteaBranch,
  GiteaPullRequest,
  GiteaRepo,
  GiteaVersion,
} from "./types";

// --- diagnostics -----------------------------------------------------------

export const pingGit = () => invoke<string>("ping_git");

// --- accounts --------------------------------------------------------------

export interface AddAccountInput {
  url: string;
  token: string;
}

export const addAccount = (input: AddAccountInput) =>
  invoke<Account>("add_account", { input });

export const listAccounts = () => invoke<Account[]>("list_accounts");

export const removeAccount = (accountId: string) =>
  invoke<void>("remove_account", { accountId });

// --- Gitea API (proxied through Rust) --------------------------------------

export const listMyRepos = (accountId: string, page = 1, limit = 50) =>
  invoke<GiteaRepo[]>("list_my_repos", { accountId, page, limit });

export const searchRepos = (
  accountId: string,
  query: string,
  page = 1,
  limit = 50,
) => invoke<GiteaRepo[]>("search_repos", { accountId, query, page, limit });

export const getRepo = (accountId: string, owner: string, repo: string) =>
  invoke<GiteaRepo>("get_repo", { accountId, owner, repo });

export const listRemoteBranches = (accountId: string, owner: string, repo: string) =>
  invoke<GiteaBranch[]>("list_remote_branches", { accountId, owner, repo });

export const getGiteaVersion = (accountId: string) =>
  invoke<GiteaVersion>("get_gitea_version", { accountId });

export const listPulls = (
  accountId: string,
  owner: string,
  repo: string,
  state: "open" | "closed" | "all" = "open",
) => invoke<GiteaPullRequest[]>("list_pulls", { accountId, owner, repo, state });

export interface CreatePullInput {
  accountId: string;
  owner: string;
  repo: string;
  title: string;
  body?: string;
  head: string;
  base: string;
}

export const createPull = (input: CreatePullInput) =>
  invoke<GiteaPullRequest>("create_pull", { input });

export const mergePull = (
  accountId: string,
  owner: string,
  repo: string,
  index: number,
  style: "merge" | "squash" | "rebase" | "rebase-merge" = "merge",
) =>
  invoke<void>("merge_pull", {
    accountId,
    owner,
    repo,
    index,
    style,
  });

// --- Local repos -----------------------------------------------------------

export const cloneRepo = (
  url: string,
  parentDir: string,
  accountId?: string,
) =>
  invoke<import("./types").LocalRepo>("clone_repo", {
    url,
    parentDir,
    accountId: accountId ?? null,
  });

export const addLocalRepo = (path: string) =>
  invoke<import("./types").LocalRepo>("add_local_repo", { path });

export const detectRemoteInfo = (repoId: string) =>
  invoke<import("./types").LocalRepo>("detect_remote_info", { repoId });

export const listLocalRepos = () =>
  invoke<import("./types").LocalRepo[]>("list_local_repos");

export const removeRepo = (repoId: string) =>
  invoke<void>("remove_repo", { repoId });

export const revealInFinder = (repoId: string) =>
  invoke<void>("reveal_in_finder", { repoId });

// --- Git working directory -------------------------------------------------

export const gitStatus = (repoId: string) =>
  invoke<import("./types").GitStatus>("git_status", { repoId });

export const gitDiff = (
  repoId: string,
  path: string,
  staged: boolean,
  untracked: boolean,
) =>
  invoke<string>("git_diff", { repoId, path, staged, untracked });

export const gitStage = (repoId: string, paths: string[]) =>
  invoke<void>("git_stage", { repoId, paths });

export const gitUnstage = (repoId: string, paths: string[]) =>
  invoke<void>("git_unstage", { repoId, paths });

export const gitDiscard = (
  repoId: string,
  paths: string[],
  untracked: string[],
) => invoke<void>("git_discard", { repoId, paths, untracked });

export const gitCommit = (repoId: string, message: string) =>
  invoke<string>("git_commit", { repoId, message });

export const gitFetch = (repoId: string) => invoke<void>("git_fetch", { repoId });
export const gitPull = (repoId: string) => invoke<void>("git_pull", { repoId });
export const gitPush = (repoId: string) => invoke<void>("git_push", { repoId });

// --- Branches (local) ------------------------------------------------------

export interface LocalBranch {
  name: string;
  sha: string;
  current: boolean;
  has_upstream: boolean;
  ahead: number | null;
  behind: number | null;
}

export const listBranches = (repoId: string) =>
  invoke<LocalBranch[]>("list_branches", { repoId });

export const createBranch = (
  repoId: string,
  name: string,
  startPoint?: string,
  checkout = true,
) =>
  invoke<void>("create_branch", {
    repoId,
    name,
    startPoint: startPoint ?? null,
    checkout,
  });

export const checkoutBranch = (repoId: string, name: string) =>
  invoke<void>("checkout_branch", { repoId, name });

export const deleteBranch = (repoId: string, name: string, force = false) =>
  invoke<void>("delete_branch", { repoId, name, force });

export const renameBranch = (repoId: string, newName: string) =>
  invoke<void>("rename_branch", { repoId, newName });

// --- History ---------------------------------------------------------------

export interface LogEntry {
  sha: string;
  short_sha: string;
  author_name: string;
  author_email: string;
  author_date: string;
  committer_name: string;
  committer_date: string;
  subject: string;
  body: string;
  refs: string[];
}

export interface CommitFile {
  path: string;
  status: string;
  additions: number;
  deletions: number;
}

export const gitLog = (
  repoId: string,
  page = 1,
  pageSize = 50,
  revision?: string,
) =>
  invoke<LogEntry[]>("git_log", {
    repoId,
    page,
    pageSize,
    revision: revision ?? null,
  });

export const gitCommitInfo = (repoId: string, sha: string) =>
  invoke<LogEntry>("git_commit_info", { repoId, sha });

export const gitCommitFiles = (repoId: string, sha: string) =>
  invoke<CommitFile[]>("git_commit_files", { repoId, sha });

export const gitCommitFileDiff = (
  repoId: string,
  sha: string,
  filePath: string,
) => invoke<string>("git_commit_file_diff", { repoId, sha, filePath });
