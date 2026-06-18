/** Left navigation: accounts header, repo list, add-repo actions. */
import { useEffect } from "react";
import { FolderPlus, GitFork, Plus, RefreshCw, X } from "lucide-react";
import { useUiStore } from "../../store/ui";
import { useAccountsStore } from "../../store/accounts";
import { useReposStore } from "../../store/repos";
import { cn } from "../../lib/cn";

export function Sidebar() {
  const openDialog = useUiStore((s) => s.openDialog);
  const accounts = useAccountsStore((s) => s.accounts);

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-[var(--color-border-muted)] bg-[var(--color-canvas-inset)]">
      {/* Brand */}
      <div className="flex h-12 items-center gap-2 border-b border-[var(--color-border-muted)] px-4">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--color-accent-emphasis)] text-white text-xs font-bold">
          G
        </div>
        <span className="font-semibold text-sm">Gitea Desktop</span>
      </div>

      {/* Accounts */}
      <div className="border-b border-[var(--color-border-muted)] px-3 py-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-fg-muted)]">
            Accounts
          </span>
          <button
            className="text-[var(--color-fg-muted)] hover:text-[var(--color-fg-default)] cursor-pointer"
            title="Add account"
            onClick={() => openDialog({ kind: "add-account" })}
          >
            <Plus size={14} />
          </button>
        </div>
        {accounts.length === 0 ? (
          <button
            className="w-full text-left text-xs text-[var(--color-fg-muted)] hover:text-[var(--color-accent)] cursor-pointer"
            onClick={() => openDialog({ kind: "add-account" })}
          >
            Connect a Gitea instance…
          </button>
        ) : (
          <ul className="space-y-1">
            {accounts.map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs"
              >
                {a.avatar_url ? (
                  <img src={a.avatar_url} alt="" className="h-5 w-5 rounded-full" />
                ) : (
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-surface)] text-[10px] font-bold">
                    {a.username.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{a.username}</div>
                  <div className="truncate text-[10px] text-[var(--color-fg-muted)]">
                    {a.url.replace(/^https?:\/\//, "")}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Repos */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-fg-muted)]">
            Repositories
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2">
          <RepoList />
        </div>
      </div>

      {/* Add-repo actions */}
      <div className="space-y-1 border-t border-[var(--color-border-muted)] p-2">
        <SidebarAction
          icon={<GitFork size={15} />}
          label="Clone repository"
          onClick={() => openDialog({ kind: "clone" })}
        />
        <SidebarAction
          icon={<FolderPlus size={15} />}
          label="Add local repository"
          onClick={() => openDialog({ kind: "add-local" })}
        />
      </div>
    </aside>
  );
}

function RepoList() {
  const repos = useReposStore((s) => s.repos);
  const refresh = useReposStore((s) => s.refresh);
  const remove = useReposStore((s) => s.remove);
  const activeRepoId = useUiStore((s) => s.activeRepoId);
  const setActiveRepo = useUiStore((s) => s.setActiveRepo);

  // Load repos on mount.
  useEffect(() => {
    refresh();
  }, [refresh]);

  if (repos.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-4 py-8 text-center">
        <RefreshCw size={20} className="text-[var(--color-fg-subtle)]" />
        <p className="text-xs text-[var(--color-fg-muted)]">
          No repositories yet.
          <br />
          Clone or add a local repo to get started.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-0.5 pb-2">
      {repos.map((r) => {
        const isActive = r.id === activeRepoId;
        return (
          <li key={r.id}>
            <div
              className={cn(
                "group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                isActive
                  ? "bg-[var(--color-accent-emphasis)]/20 text-[var(--color-fg-default)]"
                  : "text-[var(--color-fg-default)] hover:bg-[var(--color-surface-hover)]",
              )}
              onClick={() => setActiveRepo(r.id)}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{r.name}</div>
                {r.full_name && (
                  <div className="truncate text-[10px] text-[var(--color-fg-muted)]">
                    {r.full_name}
                  </div>
                )}
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Remove "${r.name}" from the app?\n(The files on disk are not deleted.)`)) {
                    if (isActive) setActiveRepo(null);
                    remove(r.id);
                  }
                }}
                className="opacity-0 transition-opacity group-hover:opacity-100 text-[var(--color-fg-muted)] hover:text-[var(--color-danger)] cursor-pointer"
                title="Remove from app"
              >
                <X size={13} />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function SidebarAction({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm",
        "text-[var(--color-fg-default)] hover:bg-[var(--color-surface-hover)] cursor-pointer",
      )}
    >
      <span className="text-[var(--color-fg-muted)]">{icon}</span>
      {label}
    </button>
  );
}
