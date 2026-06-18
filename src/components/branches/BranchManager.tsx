/** The "Branches" tab: a full-screen table of local branches with create,
 * switch, rename, and delete actions. */
import { useState } from "react";
import {
  GitBranch,
  Plus,
  Trash2,
  Check,
  Loader2,
  AlertCircle,
  Pencil,
} from "lucide-react";
import { useBranches } from "../../hooks/useBranches";
import {
  checkoutBranch,
  createBranch,
  deleteBranch,
  renameBranch,
} from "../../api/commands";
import type { LocalBranch } from "../../api/commands";
import { Button } from "../common/Button";
import { shortSha } from "../../lib/format";
import { cn } from "../../lib/cn";

interface Props {
  repoId: string;
}

export function BranchManager({ repoId }: Props) {
  const { branches, loading, error, refetch } = useBranches(repoId);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const create = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    setActionError(null);
    try {
      await createBranch(repoId, newName.trim(), undefined, true);
      setNewName("");
      setCreating(false);
      refetch();
    } catch (e) {
      setActionError((e as { message?: string })?.message ?? "Failed to create branch.");
    } finally {
      setBusy(false);
    }
  };

  const switchTo = async (name: string) => {
    setBusy(true);
    setActionError(null);
    try {
      await checkoutBranch(repoId, name);
      refetch();
    } catch (e) {
      setActionError((e as { message?: string })?.message ?? "Failed to switch branch.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (b: LocalBranch) => {
    if (b.current) {
      setActionError("Cannot delete the currently checked-out branch.");
      return;
    }
    if (!confirm(`Delete branch "${b.name}"?`)) return;
    setBusy(true);
    setActionError(null);
    try {
      await deleteBranch(repoId, b.name, true);
      refetch();
    } catch (e) {
      setActionError((e as { message?: string })?.message ?? "Failed to delete branch.");
    } finally {
      setBusy(false);
    }
  };

  const doRename = async (oldName: string) => {
    if (!renameValue.trim() || renameValue.trim() === oldName) {
      setRenaming(null);
      return;
    }
    // rename operates on current branch only — switch first if needed.
    setBusy(true);
    setActionError(null);
    try {
      // git branch -m renames the current branch; checkout first.
      await checkoutBranch(repoId, oldName);
      await renameBranch(repoId, renameValue.trim());
      setRenaming(null);
      refetch();
    } catch (e) {
      setActionError((e as { message?: string })?.message ?? "Failed to rename branch.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[var(--color-canvas)]">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--color-border-muted)] px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Branches</h2>
          <p className="text-xs text-[var(--color-fg-muted)]">
            {branches.length} local branch{branches.length === 1 ? "" : "es"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {creating ? (
            <div className="flex items-center gap-1">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="new-branch"
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-canvas-inset)] px-2 py-1 text-sm outline-none focus:border-[var(--color-accent)]"
                onKeyDown={(e) => {
                  if (e.key === "Enter") create();
                  if (e.key === "Escape") {
                    setCreating(false);
                    setNewName("");
                  }
                }}
              />
              <Button size="sm" variant="primary" onClick={create} disabled={busy || !newName.trim()}>
                Create
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setCreating(false); setNewName(""); }}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="primary" onClick={() => setCreating(true)}>
              <Plus size={14} /> New branch
            </Button>
          )}
        </div>
      </div>

      {/* Errors */}
      {error && (
        <div className="m-3 flex items-center gap-2 rounded-md border border-[var(--color-danger)] bg-[var(--color-danger)]/10 px-3 py-2 text-xs text-[var(--color-danger)]">
          <AlertCircle size={14} /> {error.message}
        </div>
      )}
      {actionError && (
        <div className="mx-3 mt-3 flex items-center gap-2 rounded-md border border-[var(--color-danger)] bg-[var(--color-danger)]/10 px-3 py-2 text-xs text-[var(--color-danger)]">
          <AlertCircle size={14} /> {actionError}
        </div>
      )}

      {/* List */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-[var(--color-fg-muted)]">
            <Loader2 size={16} className="animate-spin" /> Loading…
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[var(--color-canvas)] text-left text-[11px] uppercase tracking-wide text-[var(--color-fg-muted)]">
              <tr className="border-b border-[var(--color-border-muted)]">
                <th className="px-4 py-2 font-medium">Branch</th>
                <th className="px-4 py-2 font-medium">Last commit</th>
                <th className="px-4 py-2 font-medium">Tracking</th>
                <th className="px-4 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {branches.map((b) => (
                <tr
                  key={b.name}
                  className={cn(
                    "border-b border-[var(--color-border-muted)] hover:bg-[var(--color-surface-hover)]",
                    b.current && "bg-[var(--color-accent)]/10",
                  )}
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <GitBranch size={14} className="text-[var(--color-fg-muted)]" />
                      {renaming === b.name ? (
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") doRename(b.name);
                            if (e.key === "Escape") setRenaming(null);
                          }}
                          className="rounded border border-[var(--color-accent)] bg-[var(--color-canvas-inset)] px-1.5 py-0.5 text-sm outline-none"
                        />
                      ) : (
                        <span className="font-medium">{b.name}</span>
                      )}
                      {b.current && (
                        <span className="rounded-full bg-[var(--color-success)]/20 px-1.5 text-[10px] text-[var(--color-success)]">
                          current
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-[var(--color-fg-muted)]">
                    {shortSha(b.sha)}
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    {b.has_upstream ? (
                      <span className="flex items-center gap-2 text-[var(--color-fg-muted)]">
                        <span className="text-[var(--color-success)]">{b.ahead ? `↑${b.ahead}` : ""}</span>
                        <span className="text-[var(--color-attention)]">{b.behind ? `↓${b.behind}` : ""}</span>
                        {!b.ahead && !b.behind && "up to date"}
                      </span>
                    ) : (
                      <span className="text-[var(--color-fg-subtle)]">no upstream</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      {!b.current && renaming !== b.name && (
                        <ActionBtn
                          title="Switch to this branch"
                          onClick={() => switchTo(b.name)}
                          disabled={busy}
                        >
                          <Check size={14} />
                        </ActionBtn>
                      )}
                      <ActionBtn
                        title="Rename"
                        onClick={() => {
                          setRenaming(b.name);
                          setRenameValue(b.name);
                        }}
                        disabled={busy}
                      >
                        <Pencil size={13} />
                      </ActionBtn>
                      {!b.current && (
                        <ActionBtn
                          title="Delete branch"
                          destructive
                          onClick={() => remove(b)}
                          disabled={busy}
                        >
                          <Trash2 size={14} />
                        </ActionBtn>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function ActionBtn({
  title,
  onClick,
  disabled,
  destructive,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded p-1.5 cursor-pointer disabled:opacity-40",
        destructive
          ? "text-[var(--color-fg-muted)] hover:bg-[var(--color-danger)]/20 hover:text-[var(--color-danger)]"
          : "text-[var(--color-fg-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-fg-default)]",
      )}
    >
      {children}
    </button>
  );
}
