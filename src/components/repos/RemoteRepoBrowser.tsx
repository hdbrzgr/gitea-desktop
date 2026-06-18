/** Browse, search, and clone repositories from a connected Gitea instance. */
import { useMemo, useState } from "react";
import {
  Loader2,
  Search,
  Star,
  Lock,
  GitFork,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { Dialog } from "../common/Dialog";
import { Button } from "../common/Button";
import { useAccountsStore } from "../../store/accounts";
import { useReposStore } from "../../store/repos";
import { useUiStore } from "../../store/ui";
import { listMyRepos, searchRepos } from "../../api/commands";
import type { GiteaRepo, AppError } from "../../api/types";
import { relativeTime } from "../../lib/format";

interface Props {
  onClose: () => void;
}

export function RemoteRepoBrowser({ onClose }: Props) {
  const accounts = useAccountsStore((s) => s.accounts);
  const clone = useReposStore((s) => s.clone);
  const setActiveRepo = useUiStore((s) => s.setActiveRepo);
  const closeDialog = useUiStore((s) => s.closeDialog);

  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [parentDir, setParentDir] = useState("");
  const [repos, setRepos] = useState<GiteaRepo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"mine" | "search">("mine");
  const [cloning, setCloning] = useState<string | null>(null);

  const load = async (selectedId: string, m: "mine" | "search", q: string) => {
    if (!selectedId) return;
    setLoading(true);
    setError(null);
    try {
      const result =
        m === "search" && q.trim()
          ? await searchRepos(selectedId, q.trim())
          : await listMyRepos(selectedId);
      setRepos(result);
    } catch (e) {
      setError((e as AppError)?.message ?? "Failed to load repositories.");
      setRepos([]);
    } finally {
      setLoading(false);
    }
  };

  // Load on account change.
  useMemo(() => {
    if (accountId) load(accountId, mode, query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  const doClone = async (repo: GiteaRepo) => {
    setError(null);
    if (!parentDir.trim()) {
      setError("Enter a parent directory to clone into.");
      return;
    }
    setCloning(repo.full_name);
    try {
      const local = await clone(repo.clone_url, parentDir.trim(), accountId);
      setActiveRepo(local.id);
      closeDialog();
    } catch (e) {
      setError((e as AppError)?.message ?? "Clone failed.");
    } finally {
      setCloning(null);
    }
  };

  if (accounts.length === 0) {
    return (
      <Dialog title="Clone repository" onClose={onClose} width="lg">
        <div className="py-6 text-center text-sm text-[var(--color-fg-muted)]">
          Connect a Gitea account first to browse repositories.
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      title="Clone repository"
      onClose={onClose}
      width="lg"
      footer={<Button variant="secondary" onClick={onClose}>Close</Button>}
    >
      <div className="space-y-3">
        {/* Account + mode controls */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={accountId}
            onChange={(e) => {
              setAccountId(e.target.value);
              setRepos(null);
            }}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-canvas-inset)] px-2 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.username} @ {a.url.replace(/^https?:\/\//, "")}
              </option>
            ))}
          </select>

          <div className="flex rounded-md border border-[var(--color-border)] p-0.5 text-xs">
            <ModeButton active={mode === "mine"} onClick={() => { setMode("mine"); load(accountId, "mine", ""); }}>
              My repositories
            </ModeButton>
            <ModeButton active={mode === "search"} onClick={() => setMode("search")}>
              Search
            </ModeButton>
          </div>

          {mode === "search" && (
            <form
              className="flex flex-1 items-center gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                load(accountId, "search", query);
              }}
            >
              <div className="relative flex-1">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-fg-muted)]" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search repositories…"
                  className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-canvas-inset)] py-1.5 pl-8 pr-2 text-sm outline-none focus:border-[var(--color-accent)]"
                />
              </div>
              <Button type="submit" size="sm">Search</Button>
            </form>
          )}
        </div>

        {/* Clone target path */}
        <label className="block">
          <div className="mb-1 text-[11px] font-medium text-[var(--color-fg-muted)]">
            Clone into directory
          </div>
          <input
            value={parentDir}
            onChange={(e) => setParentDir(e.target.value)}
            placeholder="/Users/you/projects"
            spellCheck={false}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-canvas-inset)] px-3 py-1.5 font-mono text-sm outline-none focus:border-[var(--color-accent)]"
          />
        </label>

        {error && (
          <div className="flex items-center gap-2 rounded-md border border-[var(--color-danger)] bg-[var(--color-danger)]/10 px-3 py-2 text-xs text-[var(--color-danger)]">
            <AlertCircle size={14} /> {error}
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-[var(--color-fg-muted)]">
            <Loader2 size={16} className="animate-spin" /> Loading…
          </div>
        )}

        {!loading && repos && repos.length === 0 && !error && (
          <div className="py-10 text-center text-sm text-[var(--color-fg-muted)]">
            No repositories found.
          </div>
        )}

        {!loading && repos && repos.length > 0 && (
          <ul className="max-h-[40vh] divide-y divide-[var(--color-border-muted)] overflow-y-auto">
            {repos.map((r) => (
              <RepoRow
                key={r.id}
                repo={r}
                cloning={cloning === r.full_name}
                onClone={() => doClone(r)}
              />
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "rounded px-2.5 py-1 cursor-pointer " +
        (active
          ? "bg-[var(--color-surface-hover)] text-[var(--color-fg-default)]"
          : "text-[var(--color-fg-muted)] hover:text-[var(--color-fg-default)]")
      }
    >
      {children}
    </button>
  );
}

function RepoRow({
  repo,
  cloning,
  onClone,
}: {
  repo: GiteaRepo;
  cloning: boolean;
  onClone: () => void;
}) {
  return (
    <li className="flex items-start gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {repo.private ? <Lock size={13} className="text-[var(--color-fg-muted)]" /> : null}
          <span className="truncate text-sm font-medium">{repo.full_name}</span>
          {repo.fork && <GitFork size={12} className="text-[var(--color-fg-muted)]" />}
        </div>
        {repo.description && (
          <p className="mt-0.5 line-clamp-1 text-xs text-[var(--color-fg-muted)]">
            {repo.description}
          </p>
        )}
        <div className="mt-1 flex items-center gap-3 text-[11px] text-[var(--color-fg-muted)]">
          <span className="flex items-center gap-1">
            <Star size={11} /> {repo.stars_count}
          </span>
          <span className="flex items-center gap-1">
            <GitFork size={11} /> {repo.forks_count}
          </span>
          <span>Updated {relativeTime(repo.updated_at)}</span>
          <span className="rounded-full border border-[var(--color-border)] px-1.5 py-px text-[10px]">
            {repo.default_branch}
          </span>
        </div>
      </div>
      <Button
        size="sm"
        variant="primary"
        onClick={onClone}
        disabled={cloning}
        title={`Clone ${repo.clone_url}`}
      >
        {cloning ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
        {cloning ? "Cloning…" : "Clone"}
      </Button>
    </li>
  );
}
