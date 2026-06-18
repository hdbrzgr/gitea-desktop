/** Main content area. Routes to the active tab, or an empty-state if no repo
 * is selected. */
import { useUiStore } from "../../store/ui";
import { useReposStore } from "../../store/repos";
import { ChangesView } from "../changes/ChangesView";
import { BranchManager } from "../branches/BranchManager";
import { HistoryView } from "../history/HistoryView";
import { PullList } from "../pulls/PullList";
import giteaLogo from "../../assets/gitea-logo.svg";

export function Content() {
  const activeRepoId = useUiStore((s) => s.activeRepoId);

  if (!activeRepoId) return <EmptyState />;

  return <TabContent repoId={activeRepoId} />;
}

function TabContent({ repoId }: { repoId: string }) {
  const tab = useUiStore((s) => s.tab);
  const repos = useReposStore((s) => s.repos);
  const repo = repos.find((r) => r.id === repoId);

  if (tab === "changes") {
    return <ChangesView repoId={repoId} />;
  }

  if (tab === "branches") {
    return <BranchManager repoId={repoId} />;
  }

  if (tab === "history") {
    return <HistoryView repoId={repoId} />;
  }

  if (tab === "pulls") {
    return <PullList repoId={repoId} />;
  }

  // History / Branches / Pulls land in later phases.
  return (
    <div className="flex flex-1 items-center justify-center bg-[var(--color-canvas)] text-sm text-[var(--color-fg-muted)]">
      <div className="text-center">
        <div className="mb-1 capitalize">{tab}</div>
        <div className="text-xs text-[var(--color-fg-subtle)]">
          {repo?.name} — this view is implemented in a later phase.
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  const openDialog = useUiStore((s) => s.openDialog);
  return (
    <div className="flex flex-1 items-center justify-center bg-[var(--color-canvas)]">
      <div className="max-w-sm text-center">
        <img
          src={giteaLogo}
          alt="Gitea"
          className="mx-auto mb-4 h-16 w-16 rounded-2xl bg-[var(--color-surface)] p-2"
        />
        <h1 className="mb-1 text-lg font-semibold">Welcome to Gitea Desktop</h1>
        <p className="mb-5 text-sm text-[var(--color-fg-muted)]">
          Clone a remote repository or open a local one to start managing your
          work.
        </p>
        <div className="flex justify-center gap-2">
          <button
            className="rounded-md bg-[var(--color-success-emphasis)] px-3 py-1.5 text-sm font-medium text-white hover:brightness-110 cursor-pointer"
            onClick={() => openDialog({ kind: "clone" })}
          >
            Clone a repository
          </button>
          <button
            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--color-surface-hover)] cursor-pointer"
            onClick={() => openDialog({ kind: "add-local" })}
          >
            Add local repository
          </button>
        </div>
      </div>
    </div>
  );
}
