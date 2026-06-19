//! One-shot loopback HTTP server that captures the OAuth2 redirect callback.
//!
//! We bind a `tokio::net::TcpListener` on `127.0.0.1` and accept exactly one
//! connection. The browser's redirect sends `GET /callback?code=...&state=...`
//! (or `?error=...`). We parse the query, reply with a minimal HTML page so
//! the user sees "you can close this tab", and deliver the params on a
//! [`tokio::sync::oneshot`] channel.
//!
//! Per RFC 8252 §7.3 we operate on the loopback interface only and accept any
//! ephemeral port. We deliberately use `127.0.0.1` (not `localhost`) to avoid
//! IPv6 `::1` resolution mismatches — a known Gitea gotcha (issue #3761).

use std::time::Duration;

use tokio::net::TcpListener;
use tokio::sync::oneshot;

use crate::error::{AppError, AppResult};

/// What we extracted from the OAuth2 redirect.
pub enum CallbackOutcome {
    Success { code: String, state: String },
    /// The provider returned an explicit error (e.g. user denied consent).
    Error(String),
}

/// Bind a listener on an OS-assigned loopback port and return both the port
/// and the receiver that will be fed the callback outcome.
///
/// `expected_state` is the value we sent in the authorize request; if the
/// callback's `state` differs, we report an error (CSRF protection).
pub async fn spawn(expected_state: String) -> AppResult<(u16, oneshot::Receiver<CallbackOutcome>)> {
    // OS-assigned port: bind to port 0 and read back the chosen port.
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| AppError::Other(format!("Failed to bind loopback listener: {e}")))?;
    let port = listener
        .local_addr()
        .map_err(|e| AppError::Other(format!("No local address: {e}")))?
        .port();

    let (tx, rx) = oneshot::channel::<CallbackOutcome>();

    tokio::spawn(async move {
        // Accept a single connection, with a generous timeout for the user to
        // finish authorizing in the browser.
        let accept = tokio::time::timeout(Duration::from_secs(300), listener.accept()).await;
        let (mut stream, _addr) = match accept {
            Ok(Ok(conn)) => conn,
            Ok(Err(e)) => {
                let _ = tx.send(CallbackOutcome::Error(format!("Accept failed: {e}")));
                return;
            }
            Err(_) => {
                let _ = tx.send(CallbackOutcome::Error(
                    "Login timed out — no callback received within 5 minutes.".into(),
                ));
                return;
            }
        };

        // Read the request (it's a single small GET). Use a length-limited read.
        use tokio::io::AsyncReadExt;
        let mut buf = [0u8; 8192];
        let n = match stream.read(&mut buf).await {
            Ok(n) => n,
            Err(e) => {
                let _ = tx.send(CallbackOutcome::Error(format!("Read failed: {e}")));
                return;
            }
        };
        let request = String::from_utf8_lossy(&buf[..n]);

        // Parse the request line: "GET /callback?code=...&state=... HTTP/1.1".
        let outcome = parse_callback(&request, &expected_state);

        // Reply with a minimal page. The user sees this briefly in the browser.
        let body = match &outcome {
            CallbackOutcome::Success { .. } => SUCCESS_HTML,
            CallbackOutcome::Error(msg) => &error_html(msg),
        };
        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nConnection: close\r\nContent-Length: {}\r\n\r\n{}",
            body.len(),
            body
        );
        use tokio::io::AsyncWriteExt;
        let _ = stream.write_all(response.as_bytes()).await;
        let _ = stream.shutdown().await;

        let _ = tx.send(outcome);
    });

    Ok((port, rx))
}

/// Parse the request line's path/query into a callback outcome, validating
/// the `state` against the expected value.
fn parse_callback(request: &str, expected_state: &str) -> CallbackOutcome {
    // First line looks like: GET /callback?code=abc&state=xyz HTTP/1.1
    let request_line = request.lines().next().unwrap_or("");
    let Some(target) = request_line.split_whitespace().nth(1) else {
        return CallbackOutcome::Error("Malformed callback request".into());
    };
    let Some((_path, query)) = target.split_once('?') else {
        // No query — likely an error or a manual hit.
        return CallbackOutcome::Error("Callback had no query parameters".into());
    };

    let params = parse_query(query);

    // Explicit OAuth2 error from the provider.
    if let Some(err) = params.get("error") {
        let desc = params
            .get("error_description")
            .cloned()
            .unwrap_or_default();
        return CallbackOutcome::Error(if desc.is_empty() {
            format!("Authorization error: {err}")
        } else {
            format!("Authorization error: {err} — {desc}")
        });
    }

    let Some(code) = params.get("code").cloned() else {
        return CallbackOutcome::Error("Callback missing 'code' parameter".into());
    };
    let Some(state) = params.get("state").cloned() else {
        return CallbackOutcome::Error("Callback missing 'state' parameter".into());
    };

    if state != expected_state {
        return CallbackOutcome::Error(
            "State mismatch — possible CSRF attack. Login aborted.".into(),
        );
    }

    CallbackOutcome::Success { code, state }
}

/// Minimal URL query-string parser (handles `+` as space and `%XX` decoding).
fn parse_query(query: &str) -> std::collections::HashMap<String, String> {
    let mut map = std::collections::HashMap::new();
    for pair in query.split('&') {
        let Some((k, v)) = pair.split_once('=') else {
            continue;
        };
        let key = percent_decode(k);
        let val = percent_decode(v);
        map.insert(key, val);
    }
    map
}

fn percent_decode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        let b = bytes[i];
        match b {
            b'+' => out.push(' '),
            b'%' if i + 2 < bytes.len() => {
                let hex = &bytes[i + 1..i + 3];
                if let Some(byte) = u8::from_str_radix(
                    &String::from_utf8_lossy(hex),
                    16,
                )
                .ok()
                {
                    out.push(byte as char);
                }
                i += 2;
            }
            _ => out.push(b as char),
        }
        i += 1;
    }
    out
}

const SUCCESS_HTML: &str = r#"<!doctype html><html><head><meta charset="utf-8"><title>Gitea Desktop</title>
<style>body{font-family:-apple-system,sans-serif;background:#0d1117;color:#e6edf3;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
.box{text-align:center;max-width:360px}h1{font-size:18px;margin:0 0 8px}.muted{color:#7d8590;font-size:14px}</style></head>
<body><div class="box"><h1>✓ Authorization complete</h1><p class="muted">You can close this tab and return to Gitea Desktop.</p></div></body></html>"#;

fn error_html(msg: &str) -> String {
    format!(
        r#"<!doctype html><html><head><meta charset="utf-8"><title>Gitea Desktop</title>
<style>body{{font-family:-apple-system,sans-serif;background:#0d1117;color:#e6edf3;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}}
.box{{text-align:center;max-width:380px}}h1{{font-size:18px;color:#f85149;margin:0 0 8px}}.muted{{color:#7d8590;font-size:14px}}</style></head>
<body><div class="box"><h1>Authorization failed</h1><p class="muted">{msg}</p></div></body></html>"#
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_success_callback() {
        let req = "GET /callback?code=abc123&state=xyz HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n";
        match parse_callback(req, "xyz") {
            CallbackOutcome::Success { code, state } => {
                assert_eq!(code, "abc123");
                assert_eq!(state, "xyz");
            }
            _ => panic!("expected success"),
        }
    }

    #[test]
    fn rejects_state_mismatch() {
        let req = "GET /callback?code=abc&state=evil HTTP/1.1\r\n\r\n";
        assert!(matches!(parse_callback(req, "good"), CallbackOutcome::Error(_)));
    }

    #[test]
    fn surfaces_provider_error() {
        let req = "GET /callback?error=access_denied&error_description=user+refused HTTP/1.1\r\n\r\n";
        match parse_callback(req, "any") {
            CallbackOutcome::Error(m) => assert!(m.contains("access_denied")),
            _ => panic!("expected error"),
        }
    }

    #[test]
    fn decodes_percent_encoded() {
        assert_eq!(percent_decode("hello%20world"), "hello world");
        assert_eq!(percent_decode("a+b"), "a b");
    }
}
