/**
 * Frontend type definitions. These mirror the Rust structs in
 * `src-tauri/src/models.rs` and `src-tauri/src/gitea/models.rs` exactly —
 * field names are snake_case to match serde's default output.
 */

export interface AppError {
  kind:
    | "auth"
    | "network"
    | "api"
    | "git"
    | "config"
    | "not_found"
    | "other";
  message: string;
}

export interface Account {
  id: string;
  url: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface LocalRepo {
  id: string;
  path: string;
  name: string;
  host: string | null;
  full_name: string | null;
  account_id: string | null;
}

/** A Gitea user returned by `/user` and embedded in repos/PRs. */
export interface GiteaUser {
  login: string;
  id: number;
  full_name: string;
  email: string;
  avatar_url: string;
  username: string;
}

export interface GiteaRepo {
  id: number;
  name: string;
  full_name: string;
  description: string;
  private: boolean;
  fork: boolean;
  empty: boolean;
  archive: boolean;
  html_url: string;
  ssh_url: string;
  clone_url: string;
  default_branch: string;
  stars_count: number;
  forks_count: number;
  watchers_count: number;
  open_issues_count: number;
  owner: GiteaUser | null;
  updated_at: string | null;
}

export interface GiteaBranch {
  name: string;
  commit: { id: string; timestamp: string; message: string };
  protected: boolean;
}

export interface GiteaPullRequest {
  id: number;
  number: number;
  title: string;
  body: string;
  state: string;
  mergeable: boolean;
  merged: boolean;
  user: GiteaUser | null;
  html_url: string;
  created_at: string;
  updated_at: string;
  head: GiteaPullBranch | null;
  base: GiteaPullBranch | null;
}

export interface GiteaPullBranch {
  label: string;
  ref: string;
  sha: string;
  repo: GiteaRepo | null;
}

export interface GiteaVersion {
  version: string;
}

/** Working-directory status parsed from `git status --porcelain`. */
export type FileStatus =
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "copied"
  | "untracked"
  | "conflicted"
  | "type_changed"
  | "unmodified";

export interface FileChange {
  path: string;
  old_path: string | null;
  x: string;
  y: string;
  status: FileStatus;
}

export interface GitStatus {
  branch: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  files: FileChange[];
  detached: boolean;
  initial_commit: boolean;
}

/** A single commit in `git log` output. */
export interface GitCommit {
  sha: string;
  short_sha: string;
  author_name: string;
  author_email: string;
  author_date: string; // ISO 8601
  committer_name: string;
  committer_date: string;
  subject: string;
  body: string;
  refs: string[];
}
