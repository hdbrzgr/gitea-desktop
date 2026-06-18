//! Parsing of git remote URLs (HTTPS and SSH forms) into host/owner/repo.

use url::Url;

/// Parsed components of a remote URL.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RemoteInfo {
    /// Lowercased host, e.g. "gitea.example.com". Includes port if present.
    pub host: String,
    /// "owner/repo" path segment.
    pub full_name: String,
    pub owner: String,
    pub repo: String,
}

/// Parse a remote URL string. Accepts both HTTPS
/// (`https://host/owner/repo.git`) and SSH (`git@host:owner/repo.git` or
/// `ssh://git@host:port/owner/repo.git`) forms. Returns `None` if the string
/// doesn't look like a recognized remote URL.
pub fn parse_remote_url(raw: &str) -> Option<RemoteInfo> {
    let raw = raw.trim();

    // SSH scp-like syntax: git@host:owner/repo.git  (no scheme)
    if !raw.contains("://") {
        if let Some((userhost, path)) = raw.split_once(':') {
            // userhost must contain '@' and no '/' to be scp-like
            if userhost.contains('@') && !userhost.contains('/') {
                let host = userhost.rsplit('@').next()?.to_lowercase();
                let (full_name, owner, repo) = parse_path(path)?;
                return Some(RemoteInfo {
                    host,
                    full_name,
                    owner,
                    repo,
                });
            }
        }
        return None;
    }

    // Scheme-based URL (https://, ssh://, git://, http://)
    let url = Url::parse(raw).ok()?;
    let host = url.host_str()?.to_lowercase();
    let port = url.port();
    let host = match port {
        Some(p) => format!("{host}:{p}"),
        None => host,
    };
    let path = url.path().trim_start_matches('/');
    let (full_name, owner, repo) = parse_path(path)?;
    Some(RemoteInfo {
        host,
        full_name,
        owner,
        repo,
    })
}

/// Turn `owner/repo.git` (possibly with leading/trailing slashes) into the
/// three components. `.git` suffix is stripped.
fn parse_path(path: &str) -> Option<(String, String, String)> {
    let trimmed = path.trim().trim_end_matches(".git").trim_end_matches('/');
    let (owner, repo) = trimmed.split_once('/')?;
    if owner.is_empty() || repo.is_empty() {
        return None;
    }
    Some((
        format!("{owner}/{repo}"),
        owner.to_string(),
        repo.to_string(),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_https() {
        let r = parse_remote_url("https://gitea.example.com/owner/repo.git").unwrap();
        assert_eq!(r.host, "gitea.example.com");
        assert_eq!(r.full_name, "owner/repo");
        assert_eq!(r.owner, "owner");
        assert_eq!(r.repo, "repo");
    }

    #[test]
    fn parses_https_no_git_suffix() {
        let r = parse_remote_url("https://gitea.example.com/owner/repo").unwrap();
        assert_eq!(r.full_name, "owner/repo");
    }

    #[test]
    fn parses_ssh_scp_form() {
        let r = parse_remote_url("git@gitea.example.com:owner/repo.git").unwrap();
        assert_eq!(r.host, "gitea.example.com");
        assert_eq!(r.full_name, "owner/repo");
    }

    #[test]
    fn parses_ssh_scheme_with_port() {
        let r = parse_remote_url("ssh://git@gitea.example.com:2222/owner/repo.git").unwrap();
        assert_eq!(r.host, "gitea.example.com:2222");
        assert_eq!(r.full_name, "owner/repo");
    }

    #[test]
    fn rejects_garbage() {
        assert!(parse_remote_url("not a url").is_none());
        assert!(parse_remote_url("https://example.com/").is_none()); // no owner/repo
    }
}
