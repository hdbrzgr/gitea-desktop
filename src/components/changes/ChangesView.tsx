/** The "Changes" tab: a three-pane layout.
 *   [FileList] [DiffViewer] [CommitForm]
 * FileList and CommitForm share the active repo's status; mutations
 * (stage/unstage/discard/commit) trigger a status refetch.
 *
 * When `subPath` is provided, every operation runs inside that submodule —
 * so you can stage, commit, and diff a submodule's own changes just like the
 * parent repo. */
import { useMemo, useState } from "react";
import { useGitStatus } from "../../hooks/useGitStatus";
import { gitCommit, gitDiscard, gitStage, gitUnstage } from "../../api/commands";
import { FileList } from "./FileList";
import { DiffViewer } from "./DiffViewer";
import { CommitForm } from "./CommitForm";
import type { FileChange } from "../../api/types";

interface Props {
  repoId: string;
  subPath?: string | null;
}

export function ChangesView({ repoId, subPath }: Props) {
  const sub = subPath ?? null;
  const { status, loading, error, refetch } = useGitStatus(repoId, sub);

  const [selected, setSelected] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);

  const files: FileChange[] = status?.files ?? [];

  const selectedFile = useMemo(
    () => files.find((f) => f.path === selected) ?? null,
    [files, selected],
  );

  const stage = async (path: string) => {
    await gitStage(repoId, [path], sub ?? undefined);
    await refetch();
  };
  const unstage = async (path: string) => {
    await gitUnstage(repoId, [path], sub ?? undefined);
    await refetch();
  };
  const discard = async (path: string, untracked: boolean) => {
    if (!confirm(`Discard changes to ${path}?\nThis cannot be undone.`)) return;
    await gitDiscard(
      repoId,
      untracked ? [] : [path],
      untracked ? [path] : [],
      sub ?? undefined,
    );
    if (selected === path) setSelected(null);
    await refetch();
  };

  const commit = async (message: string) => {
    setCommitting(true);
    try {
      await gitCommit(repoId, message, sub ?? undefined);
      await refetch();
      setSelected(null);
    } finally {
      setCommitting(false);
    }
  };

  const stagedCount = files.filter(
    (f) => f.x !== " " && f.x !== "?" && f.x !== "!",
  ).length;

  if (loading && !status) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-[var(--color-fg-muted)]">
        Loading status…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-[var(--color-danger)]">
        {error.message}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1">
      {/* Left: file list */}
      <div className="flex w-80 shrink-0 flex-col">
        <FileList
          files={files}
          selected={selected}
          onSelect={setSelected}
          onStage={stage}
          onUnstage={unstage}
          onDiscard={discard}
        />
      </div>

      {/* Center: diff */}
      {selectedFile ? (
        <DiffViewer
          repoId={repoId}
          subPath={sub}
          path={selectedFile.path}
          staged={selectedFile.x !== " " && selectedFile.x !== "?"}
          status={selectedFile.status}
        />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 text-sm text-[var(--color-fg-muted)]">
          {files.length === 0 ? (
            <>
              <div className="text-base font-medium text-[var(--color-fg-default)]">
                {sub ? "No changes in submodule" : "No local changes"}
              </div>
              <div>{sub ? `${sub} is clean.` : "Working directory is clean."}</div>
            </>
          ) : (
            <span>Select a file to view its diff</span>
          )}
        </div>
      )}

      {/* Right: commit form */}
      <div className="flex w-72 shrink-0 flex-col">
        <CommitForm
          stagedCount={stagedCount}
          branchName={status?.branch ?? null}
          busy={committing}
          onCommit={commit}
        />
      </div>
    </div>
  );
}
