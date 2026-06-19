//! PKCE (RFC 7636) helpers + random `state` generation.
//!
//! For OAuth2 *public* clients (no client_secret), PKCE proves possession of
//! the `code_verifier` so a stolen authorization code can't be redeemed. We
//! use the S256 method: `code_challenge = BASE64URL_NOPAD(SHA256(verifier))`.
//!
//! For *confidential* clients PKCE is unnecessary (the client_secret already
//! authenticates the exchange) and these helpers aren't used.

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use rand::RngCore;
use sha2::{Digest, Sha256};

/// Generate a high-entropy `code_verifier` (43–128 chars of the unreserved
/// set). We emit 32 random bytes then base64url-encode → 43 chars.
pub fn gen_verifier() -> String {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

/// Derive the `code_challenge` (S256) from a verifier.
pub fn gen_challenge(verifier: &str) -> String {
    let digest = Sha256::digest(verifier.as_bytes());
    URL_SAFE_NO_PAD.encode(digest)
}

/// Generate an opaque CSRF `state` token.
pub fn gen_state() -> String {
    let mut bytes = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn verifier_is_url_safe_and_correct_length() {
        let v = gen_verifier();
        assert!(v.len() >= 43 && v.len() <= 128);
        // base64url-no-pad: no padding, no '+'/'/'.
        assert!(!v.contains('=') && !v.contains('+') && !v.contains('/'));
    }

    #[test]
    fn challenge_is_deterministic_and_correct() {
        // Known answer for a fixed verifier (computed independently).
        let v = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
        let c = gen_challenge(v);
        assert_eq!(c, "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
    }

    #[test]
    fn state_is_unique() {
        assert_ne!(gen_state(), gen_state());
    }
}
