//! OAuth2 login support.
//!
//! Public clients use PKCE (no secret); confidential clients use a
//! client_secret. The authorization-code flow runs against
//! `{base}/login/oauth/authorize` and `{base}/login/oauth/access_token`.
//! The resulting access token is stored in the keyring and used with the
//! standard `Authorization: token <…>` header — identical to a PAT downstream.

//! OAuth2 login support.
//!
//! Public clients use PKCE (no secret); confidential clients use a
//! client_secret. The authorization-code flow runs against
//! `{base}/login/oauth/authorize` and `{base}/login/oauth/access_token`.
//! The resulting access token is stored in the keyring and used with the
//! standard `Authorization: token <…>` header — identical to a PAT downstream.

pub mod pkce;
pub mod refresh;
pub mod server;
pub mod store;

#[allow(unused_imports)]
pub use pkce::{gen_challenge, gen_state, gen_verifier};
#[allow(unused_imports)]
pub use store::{
    access_token_for, needs_refresh, read as read_token, update_oauth, write_oauth, write_pat,
    OauthTokenSet, StoredToken,
};
