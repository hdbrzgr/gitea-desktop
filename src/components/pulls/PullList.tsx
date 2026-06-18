/** The "Pull requests" tab: lists PRs from the repo's Gitea remote with a
 * detail pane (status, branches, author, body) and a merge action. Includes
 * a "New pull request" button that opens CreatePullDialog. */
import { useState } from "react";
import {
  GitPullRequest,
  Plus,
  Loader2,
  AlertCircle,
  GitMerge,
  ExternalLink,
} from "lucide-react";
import { useRepoRemote } from "../../hooks/useRepoRemote";
import { usePulls } from "../../hooks/usePulls";
import { useGitStatus } from "../../hooks/useGitStatus";
import { mergePull } from "../../api/commands";
import type { GiteaPullRequest } from "../../api/types";
import { Button } from "../common/Button";
import { CreatePullDialog } from "./CreatePullDialog";
import { relativeTime } from "../../lib/format";
import { cn } from "../../lib/cn";

interface Props {
  repoId: string;
}

export function PullList({ repoId }: Props) {
  const remote = useRepoRemote(repoId);
  const [stateFilter, setStateFilter] = useState<"open" | "closed" | "all">("open");
  const { pulls, loading, error, refetch, unavailable } = usePulls(
    remote?.accountId ?? null,
    remote?.owner ?? null,
    remote?.repo ?? null,
    stateFilter,
  );
  const { status } = useGitStatus(repoId);

  const [selected, setSelected] = useState<GiteaPullRequest | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  if (unavailable) {
    return (
      <Unavailable
        reason={
          "Pull requests require this repository to be linked to a Gitea account. " +
          "Make sure the repo was cloned or added with a matched account."
        }
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 bg-[var(--color-canvas)]">
      {/* List */}
      <div className="flex w-96 shrink-0 flex-col border-r border-[var(--color-border-muted)]">
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--color-border-muted)] px-4 py-2.5">
          <div className="flex rounded-md border border-[var(--color-border)] p-0.5 text-xs">
            {(["open", "closed", "all"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStateFilter(s)}
                className={cn(
                  "rounded px-2.5 py-1 capitalize cursor-pointer",
                  stateFilter === s
                    ? "bg-[var(--color-surface-hover)] text-[var(--color-fg-default)]"
                    : "text-[var(--color-fg-muted)] hover:text-[var(--color-fg-default)]",
                )}
              >
                {s}
              </button>
            ))}
          </div>
          <Button size="sm" variant="primary" onClick={() => setShowCreate(true)}>
            <Plus size={14} /> New
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading && pulls.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-[var(--color-fg-muted)]">
              <Loader2 size={16} className="animate-spin" /> Loading…
            </div>
          ) : error ? (
            <div className="m-3 flex items-center gap-2 rounded-md border border-[var(--color-danger)] bg-[var(--color-danger)]/10 px-3 py-2 text-xs text-[var(--color-danger)]">
              <AlertCircle size={14} /> {error.message}
            </div>
          ) : pulls.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-[var(--color-fg-muted)]">
              No {stateFilter} pull requests.
            </div>
          ) : (
            <ul>
              {pulls.map((pr) => (
                <li key={pr.number}>
                  <button
                    onClick={() => setSelected(pr)}
                    className={cn(
                      "flex w-full flex-col gap-0.5 border-b border-[var(--color-border-muted)] px-4 py-2.5 text-left cursor-pointer",
                      selected?.number === pr.number
                        ? "bg-[var(--color-accent)]/15"
                        : "hover:bg-[var(--color-surface-hover)]",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <PRStateIcon pr={pr} />
                      <span className="flex-1 text-sm font-medium">{pr.title}</span>
                      <span className="tnum font-mono text-[11px] text-[var(--color-fg-muted)]">
                        #{pr.number}
                      </span>
                    </div>
                    <span className="flex items-center gap-2 pl-6 text-[11px] text-[var(--color-fg-muted)]">
                      <span>
                        {pr.head?.ref ?? "?"} → {pr.base?.ref ?? "?"}
                      </span>
                      <span>·</span>
                      <span>by {pr.user?.login ?? "unknown"}</span>
                      <span>·</span>
                      <span>{relativeTime(pr.updated_at)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Detail */}
      {selected ? (
        <PullDetail
          pr={selected}
          remote={remote!}
          onMerged={refetch}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-[var(--color-fg-muted)]">
          Select a pull request
        </div>
      )}

      {showCreate && remote && (
        <CreatePullDialog
          onClose={() => setShowCreate(false)}
          onCreated={refetch}
          accountId={remote.accountId}
          owner={remote.owner}
          repo={remote.repo}
          defaultHead={status?.branch ?? null}
        />
      )}
    </div>
  );
}

function PullDetail({
  pr,
  remote,
  onMerged,
}: {
  pr: GiteaPullRequest;
  remote: { accountId: string; owner: string; repo: string };
  onMerged: () => Promise<void>;
}) {
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const merge = async () => {
    setError(null);
    setMerging(true);
    try {
      await mergePull(remote.accountId, remote.owner, remote.repo, pr.number, "merge");
      await onMerged();
    } catch (e) {
      setError((e as { message?: string })?.message ?? "Merge failed.");
    } finally {
      setMerging(false);
    }
  };

  const isOpen = pr.state === "open";
  const canMerge = isOpen && !pr.merged;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-[var(--color-border-muted)] px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <PRStateIcon pr={pr} />
              <h2 className="text-base font-semibold">{pr.title}</h2>
              <span className="font-mono text-sm text-[var(--color-fg-muted)]">
                #{pr.number}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs text-[var(--color-fg-muted)]">
              <PRStateBadge pr={pr} />
              <span>
                <span className="font-mono">{pr.head?.ref ?? "?"}</span> →{" "}
                <span className="font-mono">{pr.base?.ref ?? "?"}</span>
              </span>
              <span>·</span>
              <span>by {pr.user?.login ?? "unknown"}</span>
              <span>·</span>
              <span>updated {relativeTime(pr.updated_at)}</span>
            </div>
          </div>
          <a
            href={pr.html_url}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 rounded-md border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-hover)]"
            title="Open on Gitea"
          >
            <ExternalLink size={13} />
          </a>
        </div>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {pr.body ? (
          <pre className="selectable whitespace-pre-wrap font-sans text-sm text-[var(--color-fg-default)]">
            {pr.body}
          </pre>
        ) : (
          <p className="text-sm italic text-[var(--color-fg-muted)]">
            No description provided.
          </p>
        )}

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-md border border-[var(--color-danger)] bg-[var(--color-danger)]/10 px-3 py-2 text-xs text-[var(--color-danger)]">
            <AlertCircle size={14} /> {error}
          </div>
        )}
      </div>

      {/* Merge action */}
      {canMerge && (
        <div className="shrink-0 border-t border-[var(--color-border-muted)] bg-[var(--color-canvas-inset)] px-5 py-3">
          <Button variant="primary" onClick={merge} disabled={merging || !pr.mergeable}>
            {merging ? <Loader2 size={14} className="animate-spin" /> : <GitMerge size={14} />}
            {merging ? "Merging…" : pr.mergeable ? "Merge pull request" : "Not mergeable"}
          </Button>
          {!pr.mergeable && !merging && (
            <span className="ml-2 text-[11px] text-[var(--color-attention)]">
              This branch has conflicts that must be resolved first.
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function PRStateIcon({ pr }: { pr: GiteaPullRequest }) {
  if (pr.merged) {
    return <GitMerge size={14} className="shrink-0 text-[var(--color-done)]" />;
  }
  if (pr.state === "open") {
    return <GitPullRequest size={14} className="shrink-0 text-[var(--color-success)]" />;
  }
  return <GitPullRequest size={14} className="shrink-0 text-[var(--color-danger)]" />;
}

function PRStateBadge({ pr }: { pr: GiteaPullRequest }) {
  if (pr.merged) {
    return (
      <span className="rounded-full bg-[var(--color-done)]/20 px-1.5 py-px text-[10px] text-[var(--color-done)]">
        merged
      </span>
    );
  }
  const isOpen = pr.state === "open";
  return (
    <span
      className={cn(
        "rounded-full px-1.5 py-px text-[10px]",
        isOpen
          ? "bg-[var(--color-success)]/20 text-[var(--color-success)]"
          : "bg-[var(--color-danger)]/20 text-[var(--color-danger)]",
      )}
    >
      {pr.state}
    </span>
  );
}

function Unavailable({ reason }: { reason: string }) {
  return (
    <div className="flex flex-1 items-center justify-center bg-[var(--color-canvas)] px-8">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--color-surface)] text-[var(--color-attention)]">
          <GitPullRequest size={22} />
        </div>
        <p className="text-sm text-[var(--color-fg-muted)]">{reason}</p>
      </div>
    </div>
  );
}
