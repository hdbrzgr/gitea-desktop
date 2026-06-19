//! Parsing of `git status --porcelain=v1 -z --branch`.
//!
//! The porcelain v1 format is one entry per file. Each entry begins with a
//! 2-character status code (XY), a space, and the path. Renames are
//! `XY oldpath\0newpath` (with `-z`). The `-z` flag means every record is
//! NUL-terminated instead of newline-terminated, so paths with spaces or
//! newlines are handled correctly.
//!
//! XY meaning (from `git status` docs):
//!   - X = staged (index) status
//!   - Y = working tree status
//!   - ' ' = unmodified
//!
//! The `branch` line (when `--branch` is passed) comes first and starts with
//! `## `. We extract ahead/behind counts from it.

use serde::{Deserialize, Serialize};

/// A single changed file in the working tree.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileChange {
    pub path: String,
    /// For renames: the previous path. `None` otherwise.
    pub old_path: Option<String>,
    /// Staged (index) status code, e.g. 'M', 'A', 'D', 'R', ' '.
    pub x: String,
    /// Working-tree status code.
    pub y: String,
    /// Combined, human-friendly label like "Modified", "Added", etc.
    pub status: FileStatus,
}

/// Friendly bucket for a file's change type, for UI badges.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FileStatus {
    Modified,
    Added,
    Deleted,
    Renamed,
    Copied,
    Untracked,
    Conflicted,
    TypeChanged,
    Unmodified,
}

impl FileStatus {
    pub fn from_xy(x: char, y: char) -> Self {
        // Conflicted states (from `git status` docs): DD, AU, UD, UA, DU, AA, UU
        let conflict_pairs = ["DD", "AU", "UD", "UA", "DU", "AA", "UU"];
        let pair: String = format!("{x}{y}");
        if conflict_pairs.contains(&pair.as_str()) {
            return FileStatus::Conflicted;
        }
        // Untracked: "??" — special, never staged.
        if x == '?' && y == '?' {
            return FileStatus::Untracked;
        }
        // Prefer the staged code if present, else the worktree code.
        let primary = if x != ' ' && x != '?' {
            x
        } else {
            y
        };
        match primary {
            'M' | 'm' => FileStatus::Modified,
            'A' => FileStatus::Added,
            'D' => FileStatus::Deleted,
            'R' => FileStatus::Renamed,
            'C' => FileStatus::Copied,
            'T' => FileStatus::TypeChanged,
            _ => FileStatus::Modified,
        }
    }
}

/// Aggregate status of a repository: branch info plus changed files.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitStatus {
    pub branch: Option<String>,
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub files: Vec<FileChange>,
    /// True when HEAD is detached (no branch checked out).
    pub detached: bool,
    pub initial_commit: bool,
}

impl Default for GitStatus {
    fn default() -> Self {
        Self {
            branch: None,
            upstream: None,
            ahead: 0,
            behind: 0,
            files: vec![],
            detached: false,
            initial_commit: false,
        }
    }
}

/// Parse the output of `git status --porcelain=v1 -z --branch`.
pub fn parse_status(raw: &str) -> GitStatus {
    let mut status = GitStatus::default();

    // Split on NUL. Trailing empty token is expected.
    let mut tokens = raw.split('\0');

    // First token is the branch header (starts with "## ") or empty.
    if let Some(header) = tokens.next() {
        if !header.is_empty() {
            parse_branch_header(header, &mut status);
        }
    }

    // Remaining tokens: groups of 1 or 2 (for renames/copies).
    while let Some(entry) = tokens.next() {
        if entry.is_empty() {
            break;
        }
        // entry format: "XY path..."  (at least 3 chars: X, Y, space)
        if entry.len() < 3 {
            continue;
        }
        let bytes = entry.as_bytes();
        let x = bytes[0] as char;
        let y = bytes[1] as char;
        // The path starts after "XY " — char index 3.
        let path_field = &entry[3..];

        // For renames/copies, the next NUL token is the new path.
        let (path, old_path) = if matches!(x, 'R' | 'C') {
            // path_field is the *old* path; next token is the new path.
            match tokens.next() {
                Some(new_path) if !new_path.is_empty() => (new_path.to_string(), Some(path_field.to_string())),
                _ => (path_field.to_string(), None),
            }
        } else {
            (path_field.to_string(), None)
        };

        let file_status = FileStatus::from_xy(x, y);
        status.files.push(FileChange {
            path,
            old_path,
            x: x.to_string(),
            y: y.to_string(),
            status: file_status,
        });
    }

    status
}

/// Parse the `## branch...upstream [ahead N] [behind N]` header line.
fn parse_branch_header(header: &str, status: &mut GitStatus) {
    let rest = header.strip_prefix("## ").unwrap_or(header);

    // Detect detached HEAD: "HEAD (no branch)" or "HEAD detached at <sha>"
    if rest.starts_with("HEAD") {
        status.detached = true;
        status.branch = Some(rest.to_string());
        return;
    }

    // Detect initial commit: "No commits yet on main"
    if let Some(stripped) = rest.strip_prefix("No commits yet on ") {
        status.branch = Some(stripped.to_string());
        status.initial_commit = true;
        return;
    }

    // Split off the optional "[ahead N, behind M]" tail. The tracking block
    // is always a trailing "[...]" — but it can contain internal spaces
    // (e.g. "[ahead 2, behind 1]"), so we locate the LAST '[' that's followed
    // by a matching ']' at the very end, rather than splitting on a space.
    let (main, tracking) = if rest.ends_with(']') {
        if let Some(open) = rest.rfind(" [") {
            (rest[..open].to_string(), Some(rest[open + 1..].to_string()))
        } else {
            (rest.to_string(), None)
        }
    } else {
        (rest.to_string(), None)
    };

    // main is now e.g. "main" or "main...origin/main"
    if let Some((branch, upstream)) = main.split_once("...") {
        status.branch = Some(branch.trim().to_string());
        // upstream may have a trailing space if there was a tracking block.
        status.upstream = Some(upstream.trim().to_string());
    } else {
        status.branch = Some(main.trim().to_string());
    }

    if let Some(t) = tracking {
        // t looks like "[ahead 2]" or "[behind 1]" or "[ahead 2, behind 3]".
        let inner = t.trim_start_matches('[').trim_end_matches(']');
        for part in inner.split(',') {
            let part = part.trim();
            if let Some(n) = part.strip_prefix("ahead ") {
                status.ahead = n.parse().unwrap_or(0);
            } else if let Some(n) = part.strip_prefix("behind ") {
                status.behind = n.parse().unwrap_or(0);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_simple_branch_no_upstream() {
        let s = parse_status("## main\0M  file.txt\0\0");
        assert_eq!(s.branch.as_deref(), Some("main"));
        assert_eq!(s.files.len(), 1);
        assert_eq!(s.files[0].path, "file.txt");
    }

    #[test]
    fn parses_ahead_behind() {
        let raw = "## main...origin/main [ahead 2, behind 1]\0\0";
        let s = parse_status(raw);
        assert_eq!(s.branch.as_deref(), Some("main"));
        assert_eq!(s.upstream.as_deref(), Some("origin/main"));
        assert_eq!((s.ahead, s.behind), (2, 1));
    }

    #[test]
    fn parses_rename_two_tokens() {
        // Renamed: "R  old\0new\0"
        let raw = "## main\0R  old_name\0new_name\0\0";
        let s = parse_status(raw);
        assert_eq!(s.files.len(), 1);
        assert_eq!(s.files[0].path, "new_name");
        assert_eq!(s.files[0].old_path.as_deref(), Some("old_name"));
        assert_eq!(s.files[0].status, FileStatus::Renamed);
    }

    #[test]
    fn parses_untracked_and_conflict() {
        let raw = "## main\0?? new\0UU both\0\0";
        let s = parse_status(raw);
        assert_eq!(s.files.len(), 2);
        assert_eq!(s.files[0].status, FileStatus::Untracked);
        assert_eq!(s.files[1].status, FileStatus::Conflicted);
    }
}
