//! Git operations, all funnelled through the `runner` which spawns the system
//! `git` binary.

pub mod remote;
pub mod runner;
pub mod status;

pub use remote::{parse_remote_url, RemoteInfo};
pub use runner::{check_git_available, run_global, run_in, GitOutput};
pub use status::{parse_status, FileChange, GitStatus};
