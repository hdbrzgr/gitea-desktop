/** Browse, search, and clone repositories from a connected Gitea instance.
 *
 * Layout (top to bottom):
 *   [ account selector row ]
 *   [ mode tabs: My repositories | Search ]
 *   [ search box (only in search mode) — full width ]
 *   [ clone target path ]
 *   [ results list — fills remaining height ]
 *
 * Each control gets its own breathing room instead of cramming the account
 * dropdown, mode toggle, and search field into a single cramped row. */
import { useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Search as SearchIcon,
  Star,
  Lock,
  GitFork,
  AlertCircle,
  Check,
  FolderOpen,
  X,
  Inbox,
} from "lucide-react";
import { Dialog } from "../common/Dialog";
import { Button } from "../common/Button";
import { useAccountsStore } from "../../store/accounts";
import { useReposStore } from "../../store/repos";
import { useUiStore } from "../../store/ui";
import { getSettings, listMyRepos, searchRepos } from "../../api/commands";
import { pickDirectory } from "../../api/dialog";
import type { GiteaRepo, AppError } from "../../api/types";
import { relativeTime } from "../../lib/format";
import { cn } from "../../lib/cn";

interface Props {
  onClose: () => void;
}

type Mode = "mine" | "search";

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
  const [mode, setMode] = useState<Mode>("mine");
  const [cloning, setCloning] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  // Load the default clone directory once.
  useEffect(() => {
    let cancelled = false;
    getSettings()
      .then((s) => {
        if (!cancelled && parentDir === "") setParentDir(s.defaultCloneDir);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async (selectedId: string, m: Mode, q: string) => {
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

  // Load whenever account changes.
  useMemo(() => {
    if (accountId) load(accountId, mode, query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  const switchMode = (m: Mode) => {
    setMode(m);
    if (m === "mine") {
      load(accountId, "mine", "");
    } else {
      // Entering search mode clears results until the user searches.
      setRepos(null);
      setError(null);
    }
  };

  const chooseDir = async () => {
    setPicking(true);
    try {
      const dir = await pickDirectory();
      if (dir) setParentDir(dir);
    } finally {
      setPicking(false);
    }
  };

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
        <div className="py-10 text-center text-sm text-[var(--color-fg-muted)]">
          Connect a Gitea account first to browse repositories.
        </div>
      </Dialog>
    );
  }

  const count = repos?.length ?? 0;

  return (
    <Dialog
      title="Clone repository"
      onClose={onClose}
      width="lg"
      footer={<Button variant="secondary" onClick={onClose}>Close</Button>}
    >
      <div className="flex flex-col gap-3">
        {/* Account selector — its own row */}
        <label className="block">
          <div className="mb-1 text-[11px] font-medium text-[var(--color-fg-muted)]">
            Account
          </div>
          <select
            value={accountId}
            onChange={(e) => {
              setAccountId(e.target.value);
              setRepos(null);
            }}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-canvas-inset)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.username} @ {a.url.replace(/^https?:\/\//, "")}
              </option>
            ))}
          </select>
        </label>

        {/* Mode tabs */}
        <div role="tablist" className="flex gap-1 rounded-md bg-[var(--color-canvas-inset)] p-1">
          <ModeTab active={mode === "mine"} onClick={() => switchMode("mine")}>
            My repositories
          </ModeTab>
          <ModeTab active={mode === "search"} onClick={() => switchMode("search")}>
            Search
          </ModeTab>
        </div>

        {/* Search box — full width, only in search mode */}
        {mode === "search" && (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              load(accountId, "search", query);
            }}
          >
            <div className="relative flex-1">
              <SearchIcon size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-fg-muted)]" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search repositories by name…"
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-canvas-inset)] py-2 pl-9 pr-3 text-sm outline-none focus:border-[var(--color-accent)]"
              />
            </div>
            <Button type="submit" size="md" disabled={!query.trim() || loading}>
              Search
            </Button>
          </form>
        )}

        {/* Clone target path */}
        <label className="block">
          <div className="mb-1 text-[11px] font-medium text-[var(--color-fg-muted)]">
            Clone into directory
          </div>
          <div className="flex items-stretch gap-2">
            <input
              value={parentDir}
              onChange={(e) => setParentDir(e.target.value)}
              placeholder="/Users/you/projects"
              spellCheck={false}
              className="min-w-0 flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-canvas-inset)] px-3 py-1.5 font-mono text-sm outline-none focus:border-[var(--color-accent)]"
            />
            <Button
              variant="secondary"
              size="md"
              onClick={chooseDir}
              disabled={picking}
              className="shrink-0"
            >
              {picking ? <Loader2 size={14} className="animate-spin" /> : <FolderOpen size={14} />}
              Choose…
            </Button>
          </div>
        </label>

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-[var(--color-danger)] bg-[var(--color-danger)]/10 px-3 py-2 text-xs text-[var(--color-danger)]">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="shrink-0 cursor-pointer hover:opacity-70">
              <X size={13} />
            </button>
          </div>
        )}

        {/* Results header + list */}
        {mode === "mine" && (loading || (repos && count > 0)) && (
          <ResultsHeader loading={loading} count={count} />
        )}
        {mode === "search" && repos !== null && (
          <ResultsHeader loading={loading} count={count} query={query.trim()} />
        )}

        <div className="min-h-0">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-[var(--color-fg-muted)]">
              <Loader2 size={16} className="animate-spin" /> Loading…
            </div>
          ) : repos && count === 0 ? (
            <EmptyState mode={mode} hasQuery={query.trim().length > 0} />
          ) : (
            repos && count > 0 && (
              <ul className="max-h-[38vh] divide-y divide-[var(--color-border-muted)] overflow-y-auto rounded-md border border-[var(--color-border-muted)]">
                {repos.map((r) => (
                  <RepoRow
                    key={r.id}
                    repo={r}
                    cloning={cloning === r.full_name}
                    parentDir={parentDir}
                    onClone={() => doClone(r)}
                  />
                ))}
              </ul>
            )
          )}
        </div>
      </div>
    </Dialog>
  );
}

/** Full-width tab button for the mode switch. */
function ModeTab({
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
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex-1 rounded px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
        active
          ? "bg-[var(--color-surface)] text-[var(--color-fg-default)] shadow-sm"
          : "text-[var(--color-fg-muted)] hover:text-[var(--color-fg-default)]",
      )}
    >
      {children}
    </button>
  );
}

/** Small results summary line above the list. */
function ResultsHeader({
  loading,
  count,
  query,
}: {
  loading: boolean;
  count: number;
  query?: string;
}) {
  if (loading) return null;
  return (
    <div className="flex items-center justify-between px-1 text-[11px] text-[var(--color-fg-muted)]">
      <span>
        {count} repo{count === 1 ? "" : "s"}
        {query ? <> for “<span className="text-[var(--color-fg-default)]">{query}</span>”</> : null}
      </span>
    </div>
  );
}

function EmptyState({ mode, hasQuery }: { mode: Mode; hasQuery: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <Inbox size={28} className="text-[var(--color-fg-subtle)]" />
      <p className="text-sm text-[var(--color-fg-muted)]">
        {mode === "search"
          ? hasQuery
            ? "No repositories match your search."
            : "Type a search term above and press Enter."
          : "No repositories on this account."}
      </p>
    </div>
  );
}

function RepoRow({
  repo,
  cloning,
  parentDir,
  onClone,
}: {
  repo: GiteaRepo;
  cloning: boolean;
  parentDir: string;
  onClone: () => void;
}) {
  return (
    <li className="group flex items-start gap-3 px-3 py-2.5 hover:bg-[var(--color-surface-hover)]">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {repo.private ? (
            <Lock size={13} className="shrink-0 text-[var(--color-fg-muted)]" />
          ) : null}
          <span className="truncate text-sm font-medium">{repo.full_name}</span>
          {repo.fork && (
            <GitFork size={12} className="shrink-0 text-[var(--color-fg-muted)]" />
          )}
          {repo.private && (
            <span className="shrink-0 rounded-full bg-[var(--color-attention)]/20 px-1.5 py-px text-[10px] text-[var(--color-attention)]">
              private
            </span>
          )}
        </div>
        {repo.description && (
          <p className="mt-0.5 line-clamp-1 text-xs text-[var(--color-fg-muted)]">
            {repo.description}
          </p>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-[var(--color-fg-muted)]">
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
        title={parentDir ? `Clone into ${parentDir}/${repo.name}` : `Clone ${repo.clone_url}`}
        className="shrink-0"
      >
        {cloning ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
        {cloning ? "Cloning…" : "Clone"}
      </Button>
    </li>
  );
}
