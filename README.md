# 🍵 Gitea Desktop

A native desktop client for [Gitea](https://gitea.io) — manage your repositories, branches, commits, and pull requests without leaving your desktop. Built with [Tauri 2](https://tauri.app), React, and Rust.

## 📥 Download

Grab the latest build from [**Releases**](https://github.com/hdbrzgr/gitea-desktop/releases/latest).

- 🍎 **macOS (Apple Silicon)** — `GiteaDesktop_0.1.0_aarch64.dmg`

> The app isn't notarized yet. On first launch, right-click the app → **Open**, or allow it under **System Settings → Privacy & Security**.

## ✨ Features

- 👥 **Multi-account** — connect multiple Gitea accounts via OAuth2 or personal access tokens. Credentials are stored securely in the OS keychain (macOS Keychain, Windows Credential Manager, Linux Secret Service).
- 📦 **Repository management** — clone remote repositories, add existing local clones, browse your repositories, and search across the instance.
- 📝 **Working tree** — view status and diffs, stage/unstage files, discard changes, and commit with a built-in diff viewer.
- 🔄 **Sync** — fetch, pull, and push against your Gitea remotes.
- 🌿 **Branches** — list, create, checkout, rename, and delete branches.
- 🕑 **History** — browse the commit log with per-commit detail and file diffs.
- 🔀 **Pull requests** — list, create, and merge pull requests.
- 🧩 **Submodules** — list, init, update, and sync submodules.
- 🚀 **Open with** — launch repositories in your editor, terminal, or other detected apps.

## 🛠️ Tech stack

| Layer    | Tools                                                              |
| -------- | ----------------------------------------------------------------- |
| Frontend | React 19, TypeScript, Vite 7, Tailwind CSS 4, Zustand, TanStack Query |
| Backend  | Rust, Tauri 2, `reqwest`, `keyring`                               |
| Targets  | macOS, Windows, Linux                                              |

## 📋 Prerequisites

- [Node.js](https://nodejs.org) 18+
- [Rust](https://rustup.rs) (stable)
- Platform Tauri dependencies — see the [Tauri prerequisites guide](https://tauri.app/start/prerequisites/)
- `git` available on your `PATH`

## 💻 Development

```bash
# install dependencies
npm install

# run the app in dev mode (Vite + Tauri)
npm run tauri dev

# type-check only
npm run lint
```

`npm run dev` runs the Vite frontend alone in the browser; `npm run tauri dev` runs the full desktop app.

## 🏗️ Building

```bash
# production build (frontend + Tauri bundle)
npm run tauri build
```

### 🍎 macOS

```bash
# build and code-sign
npm run build:macos

# build, sign, and package a distributable .zip
npm run dist:macos
```

Signing is handled by `scripts/sign-macos.sh`.

### 🐧 Linux

A `Dockerfile.linux` is provided for reproducible Linux builds.

## ⚙️ Configuration

On first launch, add a Gitea account from **Settings**:

1. Enter your Gitea instance URL.
2. Authenticate via OAuth2 or paste a personal access token.

Tokens are never written to disk in plaintext — they live in the OS keychain. A default clone directory can be set in Settings (defaults to `~/Documents/Gitea`).

## 📂 Project structure

```
src/                  React frontend
  api/                Tauri command bindings and types
  components/         UI (accounts, repos, changes, history, pulls, branches, …)
  hooks/              data-fetching hooks (pulls, branches, status, …)
  store/              Zustand stores (accounts, repos, ui)
src-tauri/            Rust backend
  src/lib.rs          Tauri commands (git, Gitea API, OAuth, settings)
  src/settings.rs     persisted config
  src/models.rs       shared types
```

## 📄 License

Released under the [MIT License](LICENSE).
