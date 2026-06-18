/** Top toolbar: repo identity, branch picker, sync actions. Loads branch +
 * status data itself so a sync or branch switch can refresh everything. */
import { useUiStore } from "../../store/ui";
import { useReposStore } from "../../store/repos";
import { useBranches } from "../../hooks/useBranches";
import { useGitStatus } from "../../hooks/useGitStatus";
import { BranchPicker } from "./BranchPicker";
import { SyncButtons } from "./SyncButtons";

export function Toolbar() {
  const activeRepoId = useUiStore((s) => s.activeRepoId);
  const repos = useReposStore((s) => s.repos);
  const repo = repos.find((r) => r.id === activeRepoId) ?? null;

  const { branches, refetch: refetchBranches } = useBranches(activeRepoId);
  const { status, refetch: refetchStatus } = useGitStatus(activeRepoId);

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
            {repo.full_name && (
              <span className="truncate text-xs text-[var(--color-fg-muted)]">
                {repo.full_name}
              </span>
            )}
          </>
        ) : (
          <span className="truncate font-semibold text-sm text-[var(--color-fg-muted)]">
            No repository selected
          </span>
        )}
      </div>

      {repo && (
        <>
          <div className="mx-2 h-5 w-px bg-[var(--color-border-muted)]" />
          <BranchPicker
            repoId={repo.id}
            branches={branches}
            current={currentBranch}
            onAfterChange={refreshAll}
          />
        </>
      )}

      <div className="flex-1" />

      {repo && (
        <SyncButtons
          repoId={repo.id}
          ahead={currentStatusBranch?.ahead ?? status?.ahead ?? 0}
          behind={currentStatusBranch?.behind ?? status?.behind ?? 0}
          hasUpstream={currentStatusBranch?.has_upstream ?? !!status?.upstream}
          onAfter={refreshAll}
        />
      )}
    </header>
  );
}
