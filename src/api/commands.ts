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

export interface OauthLoginInput {
  url: string;
  clientId: string;
  clientSecret?: string | null;
}

export const startOauthLogin = (input: OauthLoginInput) =>
  invoke<Account>("start_oauth_login", { input });

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
  recurseSubmodules = true,
) =>
  invoke<import("./types").LocalRepo>("clone_repo", {
    url,
    parentDir,
    accountId: accountId ?? null,
    recurseSubmodules,
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
// Each command takes an optional `subPath` — when set, the operation runs
// inside that submodule directory instead of the superproject root.

export const gitStatus = (repoId: string, subPath?: string) =>
  invoke<import("./types").GitStatus>("git_status", {
    repoId,
    subPath: subPath ?? null,
  });

export const gitDiff = (
  repoId: string,
  path: string,
  staged: boolean,
  untracked: boolean,
  subPath?: string,
) =>
  invoke<string>("git_diff", {
    repoId,
    path,
    staged,
    untracked,
    subPath: subPath ?? null,
  });

export const gitStage = (repoId: string, paths: string[], subPath?: string) =>
  invoke<void>("git_stage", { repoId, paths, subPath: subPath ?? null });

export const gitUnstage = (repoId: string, paths: string[], subPath?: string) =>
  invoke<void>("git_unstage", { repoId, paths, subPath: subPath ?? null });

export const gitDiscard = (
  repoId: string,
  paths: string[],
  untracked: string[],
  subPath?: string,
) =>
  invoke<void>("git_discard", {
    repoId,
    paths,
    untracked,
    subPath: subPath ?? null,
  });

export const gitCommit = (repoId: string, message: string, subPath?: string) =>
  invoke<string>("git_commit", {
    repoId,
    message,
    subPath: subPath ?? null,
  });

export const gitFetch = (repoId: string, subPath?: string) =>
  invoke<void>("git_fetch", { repoId, subPath: subPath ?? null });

export const gitPull = (repoId: string, subPath?: string) =>
  invoke<void>("git_pull", {
    repoId,
    recurseSubmodules: null,
    subPath: subPath ?? null,
  });

export const gitPush = (repoId: string, subPath?: string) =>
  invoke<void>("git_push", { repoId, subPath: subPath ?? null });

// --- Branches (local) ------------------------------------------------------

export interface LocalBranch {
  name: string;
  sha: string;
  current: boolean;
  has_upstream: boolean;
  ahead: number | null;
  behind: number | null;
}

export const listBranches = (repoId: string, subPath?: string) =>
  invoke<LocalBranch[]>("list_branches", { repoId, subPath: subPath ?? null });

export const createBranch = (
  repoId: string,
  name: string,
  startPoint?: string,
  checkout = true,
  subPath?: string,
) =>
  invoke<void>("create_branch", {
    repoId,
    name,
    startPoint: startPoint ?? null,
    checkout,
    subPath: subPath ?? null,
  });

export const checkoutBranch = (repoId: string, name: string, subPath?: string) =>
  invoke<void>("checkout_branch", {
    repoId,
    name,
    subPath: subPath ?? null,
  });

export const deleteBranch = (
  repoId: string,
  name: string,
  force = false,
  subPath?: string,
) =>
  invoke<void>("delete_branch", {
    repoId,
    name,
    force,
    subPath: subPath ?? null,
  });

export const renameBranch = (repoId: string, newName: string, subPath?: string) =>
  invoke<void>("rename_branch", {
    repoId,
    newName,
    subPath: subPath ?? null,
  });

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

// --- Submodules ------------------------------------------------------------

export type SubmoduleState =
  | "up_to_date"
  | "not_initialized"
  | "modified"
  | "conflicted"
  | "unknown";

export interface Submodule {
  path: string;
  sha: string;
  short_sha: string;
  branch: string | null;
  url: string;
  state: SubmoduleState;
  description: string | null;
}

export const listSubmodules = (repoId: string) =>
  invoke<Submodule[]>("list_submodules", { repoId });

export const initSubmodules = (repoId: string, paths?: string[]) =>
  invoke<void>("init_submodules", { repoId, paths: paths ?? null });

export const updateSubmodules = (
  repoId: string,
  paths?: string[],
  recursive = true,
) =>
  invoke<void>("update_submodules", {
    repoId,
    paths: paths ?? null,
    recursive,
  });

export const syncSubmodules = (repoId: string, recursive = true) =>
  invoke<void>("sync_submodules", { repoId, recursive });

export const fetchSubmoduleUpdates = (repoId: string, recursive = true) =>
  invoke<void>("fetch_submodule_updates", { repoId, recursive });

// --- Open with -------------------------------------------------------------

export type OpenTarget =
  | "terminal"
  | "vscode"
  | "cursor"
  | "finder"
  | "zed";

export interface AppAvailability {
  target: OpenTarget;
  label: string;
  available: boolean;
}

export const detectOpenApps = () =>
  invoke<AppAvailability[]>("detect_open_apps");

export const openWith = (
  repoId: string,
  target: OpenTarget,
  subPath?: string | null,
) =>
  invoke<void>("open_with", {
    repoId,
    target,
    subPath: subPath ?? null,
  });

// --- Settings --------------------------------------------------------------

export interface EffectiveSettings {
  defaultCloneDir: string;
}

export const getSettings = () =>
  invoke<EffectiveSettings>("get_settings");

export const setDefaultCloneDir = (dir: string) =>
  invoke<EffectiveSettings>("set_default_clone_dir", { dir });

export const resetDefaultCloneDir = () =>
  invoke<EffectiveSettings>("reset_default_clone_dir");
