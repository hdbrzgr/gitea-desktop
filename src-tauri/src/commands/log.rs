//! History commands: paginated commit log + single-commit detail (files
//! changed and their diffs).
//!
//! `git log` output uses a record/field separator scheme so we can parse it
//! robustly even with multi-line commit bodies. We delimit fields with ASCII
//! unit separators (0x1F) and records with ASCII record separators (0x1E).

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::commands::helpers::repo_path;
use crate::config::store::ConfigState;
use crate::error::{AppError, AppResult};
use crate::git::run_in;

const RS: char = '\u{001E}'; // record separator
const US: char = '\u{001F}'; // unit (field) separator

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEntry {
    pub sha: String,
    pub short_sha: String,
    pub author_name: String,
    pub author_email: String,
    pub author_date: String,
    pub committer_name: String,
    pub committer_date: String,
    pub subject: String,
    pub body: String,
    /// Ref names (branches/tags) pointing at this commit, e.g. ["main", "tag: v1"].
    pub refs: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommitFile {
    pub path: String,
    pub status: String,
    pub additions: u32,
    pub deletions: u32,
}

/// Paginated commit log.
///
/// - `page` is 1-indexed; `page_size` commits per page.
/// - `revision` optionally restricts the range (e.g. "main", "main..feature").
#[tauri::command]
pub async fn git_log(
    repo_id: String,
    page: Option<i32>,
    page_size: Option<i32>,
    revision: Option<String>,
    state: State<'_, ConfigState>,
) -> AppResult<Vec<LogEntry>> {
    let path = repo_path(&state, &repo_id)?;
    let page = page.unwrap_or(1).max(1);
    let size = page_size.unwrap_or(50).clamp(1, 500);
    let skip = ((page - 1) * size) as usize;

    let rev = revision.as_deref().unwrap_or("HEAD");

    // Custom format with field separators. %n would be ambiguous in bodies,
    // so we use real control chars git passes through literally.
    let format = format!(
        "%H{us}%h{us}%an{us}%ae{us}%aI{us}%cn{us}%cI{us}%s{us}%b{us}%D",
        us = US
    );

    let args = vec![
        "log".to_string(),
        format!("--skip={skip}"),
        format!("-n{size}"),
        "--no-color".into(),
        format!("--format={format}"),
        rev.to_string(),
    ];
    let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let out = run_in(&path, &refs, None).await?;
    let raw = out.require_success("git log")?;

    Ok(parse_log(&raw))
}

/// Files changed in a single commit, with per-file add/delete line counts.
#[tauri::command]
pub async fn git_commit_files(
    repo_id: String,
    sha: String,
    state: State<'_, ConfigState>,
) -> AppResult<Vec<CommitFile>> {
    let path = repo_path(&state, &repo_id)?;
    // numstat gives "added\tdeleted\tpath" per file; renames show as
    // "added\tdeleted\tpath -> oldpath".
    let out = run_in(
        &path,
        &[
            "show",
            "--no-color",
            "--no-renames",
            "--numstat",
            "--format=",
            sha.as_str(),
        ],
        None,
    )
    .await?;
    let raw = out.require_success("git show --numstat")?;

    let mut files = Vec::new();
    for line in raw.lines() {
        if line.trim().is_empty() {
            continue;
        }
        // Binary files report "-" for counts.
        let mut parts = line.splitn(3, '\t');
        let adds = parts.next().unwrap_or("0");
        let dels = parts.next().unwrap_or("0");
        let path_field = parts.next().unwrap_or("");
        let additions: u32 = adds.parse().unwrap_or(0);
        let deletions: u32 = dels.parse().unwrap_or(0);
        let status = if adds == "-" { "binary" } else { "modified" };
        files.push(CommitFile {
            path: path_field.to_string(),
            status: status.into(),
            additions,
            deletions,
        });
    }
    Ok(files)
}

/// Full diff text for a single file within a commit (vs its first parent).
#[tauri::command]
pub async fn git_commit_file_diff(
    repo_id: String,
    sha: String,
    file_path: String,
    state: State<'_, ConfigState>,
) -> AppResult<String> {
    let path = repo_path(&state, &repo_id)?;
    let out = run_in(
        &path,
        &[
            "show",
            "--no-color",
            "--no-renames",
            sha.as_str(),
            "--",
            file_path.as_str(),
        ],
        None,
    )
    .await?;
    out.require_success("git show")
}

/// Metadata for a single commit (subject/body/authors/dates).
#[tauri::command]
pub async fn git_commit_info(
    repo_id: String,
    sha: String,
    state: State<'_, ConfigState>,
) -> AppResult<LogEntry> {
    let path = repo_path(&state, &repo_id)?;
    let format = format!(
        "%H{us}%h{us}%an{us}%ae{us}%aI{us}%cn{us}%cI{us}%s{us}%b{us}%D",
        us = US
    );
    let out = run_in(
        &path,
        &["log", "-1", format!("--format={format}").as_str(), sha.as_str()],
        None,
    )
    .await?;
    let raw = out.require_success("git log -1")?;
    let mut entries = parse_log(&raw);
    entries
        .pop()
        .ok_or_else(|| AppError::NotFound(format!("Commit {sha} not found")))
}

// --- parsing ---------------------------------------------------------------

fn parse_log(raw: &str) -> Vec<LogEntry> {
    raw.split(RS)
        .filter(|rec| !rec.trim().is_empty())
        .filter_map(parse_entry)
        .collect()
}

fn parse_entry(rec: &str) -> Option<LogEntry> {
    let fields: Vec<&str> = rec.split(US).collect();
    if fields.len() < 10 {
        return None;
    }
    let sha = fields[0].trim().to_string();
    if sha.is_empty() {
        return None;
    }
    let short_sha = fields[1].trim().to_string();
    let author_name = fields[2].to_string();
    let author_email = fields[3].to_string();
    let author_date = fields[4].to_string();
    let committer_name = fields[5].to_string();
    let committer_date = fields[6].to_string();
    let subject = fields[7].trim().to_string();
    let body = fields[8].trim().to_string();
    let refs_str = fields[9].trim();
    let refs: Vec<String> = if refs_str.is_empty() {
        Vec::new()
    } else {
        refs_str.split(", ").map(|s| s.trim().to_string()).collect()
    };
    Some(LogEntry {
        sha,
        short_sha,
        author_name,
        author_email,
        author_date,
        committer_name,
        committer_date,
        subject,
        body,
        refs,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_one_entry() {
        let raw = format!(
            "abc123{us}abc123{us}Alice{us}a@x{us}2026-01-01{us}Alice{us}2026-01-01{us}Subject{us}body line{us}HEAD -> main{rs}",
            us = US,
            rs = RS
        );
        let entries = parse_log(&raw);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].sha, "abc123");
        assert_eq!(entries[0].subject, "Subject");
        assert_eq!(entries[0].body, "body line");
        assert_eq!(entries[0].refs, vec!["HEAD -> main"]);
    }
}
