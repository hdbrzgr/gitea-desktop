//! Git operations, all funnelled through the `runner` which spawns the system
//! `git` binary.

pub mod remote;
pub mod runner;
pub mod status;

pub use runner::{check_git_available, run_in};

// Re-exports of items consumed by command modules. Each is tagged so the
// compiler doesn't warn about them sitting unused from the crate-root view.
#[allow(unused_imports)]
pub use remote::{parse_remote_url, RemoteInfo};
#[allow(unused_imports)]
pub use runner::{run_global, GitOutput};
#[allow(unused_imports)]
pub use status::{parse_status, FileChange, GitStatus};
