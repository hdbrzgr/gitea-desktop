/** Submodules management dialog for a repo: list, init, update, sync, and
 * fetch the latest submodule changes. Reuses the git submodule commands
 * proxied through Rust (with auth propagation for private submodules). */
import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  AlertCircle,
  RefreshCw,
  Download,
  Link2,
  RotateCcw,
  GitBranch,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { Dialog } from "../common/Dialog";
import { Button } from "../common/Button";
import {
  fetchSubmoduleUpdates,
  initSubmodules,
  listSubmodules,
  syncSubmodules,
  updateSubmodules,
  type Submodule,
  type SubmoduleState,
} from "../../api/commands";
import { basename } from "../../lib/format";

interface Props {
  repoId: string;
  repoName: string;
  onClose: () => void;
}

export function SubmodulesDialog({ repoId, repoName, onClose }: Props) {
  const [submodules, setSubmodules] = useState<Submodule[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const subs = await listSubmodules(repoId);
      setSubmodules(subs);
    } catch (e) {
      setError((e as { message?: string })?.message ?? "Failed to load submodules.");
      setSubmodules([]);
    } finally {
      setLoading(false);
    }
  }, [repoId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const run = async (op: string, fn: () => Promise<void>) => {
    setBusy(op);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError((e as { message?: string })?.message ?? `${op} failed.`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog
      title={`Submodules — ${repoName}`}
      onClose={onClose}
      width="lg"
      footer={
        <>
          <span className="mr-auto text-xs text-[var(--color-fg-muted)]">
            {submodules && submodules.length > 0
              ? `${submodules.length} submodule${submodules.length === 1 ? "" : "s"}`
              : ""}
          </span>
          <Button variant="secondary" onClick={onClose} disabled={busy !== null}>
            Close
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {/* Bulk actions */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => run("update", () => updateSubmodules(repoId))}
            disabled={busy !== null}
          >
            {busy === "update" ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <RefreshCw size={13} />
            )}
            Update all
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => run("fetch", () => fetchSubmoduleUpdates(repoId))}
            disabled={busy !== null}
            title="Fetch latest from each submodule's tracked branch"
          >
            {busy === "fetch" ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Download size={13} />
            )}
            Fetch updates
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => run("init", () => initSubmodules(repoId))}
            disabled={busy !== null}
          >
            {busy === "init" ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Link2 size={13} />
            )}
            Init all
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => run("sync", () => syncSubmodules(repoId))}
            disabled={busy !== null}
            title="Sync remote URLs from .gitmodules into local config"
          >
            {busy === "sync" ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <RotateCcw size={13} />
            )}
            Sync URLs
          </Button>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-md border border-[var(--color-danger)] bg-[var(--color-danger)]/10 px-3 py-2 text-xs text-[var(--color-danger)]">
            <AlertCircle size={14} /> {error}
          </div>
        )}

        {/* Submodule list */}
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-[var(--color-fg-muted)]">
            <Loader2 size={16} className="animate-spin" /> Loading submodules…
          </div>
        ) : submodules && submodules.length === 0 ? (
          <div className="py-10 text-center text-sm text-[var(--color-fg-muted)]">
            This repository has no submodules.
          </div>
        ) : (
          <ul className="divide-y divide-[var(--color-border-muted)] rounded-md border border-[var(--color-border-muted)]">
            {submodules?.map((sub) => (
              <li key={sub.path} className="flex items-center gap-3 px-3 py-2.5">
                <StateIcon state={sub.state} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {basename(sub.path)}
                    </span>
                    <span className="font-mono text-[10px] text-[var(--color-fg-subtle)]">
                      {sub.short_sha}
                    </span>
                  </div>
                  <div className="truncate text-[11px] text-[var(--color-fg-muted)]">
                    {sub.url || sub.path}
                    {sub.branch && (
                      <span className="ml-2 inline-flex items-center gap-0.5">
                        <GitBranch size={10} /> {sub.branch}
                      </span>
                    )}
                  </div>
                </div>
                <StateBadge state={sub.state} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}

function StateIcon({ state }: { state: SubmoduleState }) {
  switch (state) {
    case "up_to_date":
      return <CheckCircle2 size={15} className="shrink-0 text-[var(--color-success)]" />;
    case "not_initialized":
      return <XCircle size={15} className="shrink-0 text-[var(--color-fg-subtle)]" />;
    case "modified":
      return <AlertTriangle size={15} className="shrink-0 text-[var(--color-attention)]" />;
    case "conflicted":
      return <AlertCircle size={15} className="shrink-0 text-[var(--color-danger)]" />;
    default:
      return <CheckCircle2 size={15} className="shrink-0 text-[var(--color-fg-muted)]" />;
  }
}

function StateBadge({ state }: { state: SubmoduleState }) {
  const map: Record<SubmoduleState, { label: string; cls: string }> = {
    up_to_date: {
      label: "up to date",
      cls: "bg-[var(--color-success)]/20 text-[var(--color-success)]",
    },
    not_initialized: {
      label: "not initialized",
      cls: "bg-[var(--color-surface)] text-[var(--color-fg-muted)]",
    },
    modified: {
      label: "modified",
      cls: "bg-[var(--color-attention)]/20 text-[var(--color-attention)]",
    },
    conflicted: {
      label: "conflict",
      cls: "bg-[var(--color-danger)]/20 text-[var(--color-danger)]",
    },
    unknown: {
      label: "unknown",
      cls: "bg-[var(--color-surface)] text-[var(--color-fg-muted)]",
    },
  };
  const { label, cls } = map[state];
  return (
    <span className={`shrink-0 rounded-full px-1.5 py-px text-[10px] ${cls}`}>
      {label}
    </span>
  );
}
