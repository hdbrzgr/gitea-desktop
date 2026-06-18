/** Top toolbar: repo identity, branch picker, submodules, sync actions.
 * When activeSubmodule is set, all operations are scoped to that submodule
 * and a banner shows which submodule is active. */
import { Boxes, X } from "lucide-react";
import { useUiStore } from "../../store/ui";
import { useReposStore } from "../../store/repos";
import { useBranches } from "../../hooks/useBranches";
import { useGitStatus } from "../../hooks/useGitStatus";
import { BranchPicker } from "./BranchPicker";
import { SyncButtons } from "./SyncButtons";

export function Toolbar() {
  const activeRepoId = useUiStore((s) => s.activeRepoId);
  const activeSubmodule = useUiStore((s) => s.activeSubmodule);
  const setActiveSubmodule = useUiStore((s) => s.setActiveSubmodule);
  const openDialog = useUiStore((s) => s.openDialog);
  const repos = useReposStore((s) => s.repos);
  const repo = repos.find((r) => r.id === activeRepoId) ?? null;

  const sub = activeSubmodule ?? null;
  const { branches, refetch: refetchBranches } = useBranches(activeRepoId, sub);
  const { status, refetch: refetchStatus } = useGitStatus(activeRepoId, sub);

  const currentBranch = branches.find((b) => b.current) ?? null;
  const currentStatusBranch = branches.find((b) => b.name === status?.branch);

  const refreshAll = () => {
    refetchStatus();
    refetchBranches();
  };

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--color-border-muted)] bg-[var(--color-canvas)] px-4">
      <div className="flex min-w-0 items-center gap-2">
        {repo ? (
          <>
            <span className="truncate font-semibold text-sm">{repo.name}</span>
            {repo.full_name && !sub && (
              <span className="truncate text-xs text-[var(--color-fg-muted)]">
                {repo.full_name}
              </span>
            )}
            {sub && (
              <span className="truncate text-xs text-[var(--color-done)]">
                / {sub}
              </span>
            )}
          </>
        ) : (
          <span className="truncate font-semibold text-sm text-[var(--color-fg-muted)]">
            No repository selected
          </span>
        )}
      </div>

      {/* Submodule scope banner */}
      {sub && (
        <button
          onClick={() => setActiveSubmodule(null)}
          className="flex items-center gap-1 rounded-full bg-[var(--color-done)]/20 px-2 py-0.5 text-[11px] text-[var(--color-done)] hover:bg-[var(--color-done)]/30 cursor-pointer"
          title="Exit submodule scope (return to parent repo)"
        >
          submodule mode
          <X size={11} />
        </button>
      )}

      {repo && (
        <>
          <div className="mx-2 h-5 w-px bg-[var(--color-border-muted)]" />
          <BranchPicker
            repoId={repo.id}
            branches={branches}
            current={currentBranch}
            subPath={sub}
            onAfterChange={refreshAll}
          />

          {/* Submodules (only relevant at the superproject level) */}
          {!sub && (
            <button
              onClick={() => openDialog({ kind: "submodules" })}
              className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-sm hover:bg-[var(--color-surface-hover)] cursor-pointer"
              title="Manage submodules"
            >
              <Boxes size={14} />
              Submodules
            </button>
          )}
        </>
      )}

      <div className="flex-1" />

      {repo && (
        <SyncButtons
          repoId={repo.id}
          subPath={sub}
          ahead={currentStatusBranch?.ahead ?? status?.ahead ?? 0}
          behind={currentStatusBranch?.behind ?? status?.behind ?? 0}
          hasUpstream={currentStatusBranch?.has_upstream ?? !!status?.upstream}
          onAfter={refreshAll}
        />
      )}
    </header>
  );
}
