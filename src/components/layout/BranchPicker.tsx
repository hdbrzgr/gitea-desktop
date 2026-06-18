/** Toolbar branch picker. Shows the current branch; opens a dropdown to
 * switch branches or create a new one. */
import { useEffect, useRef, useState } from "react";
import { GitBranch, Check, Plus, ChevronDown, Search } from "lucide-react";
import {
  checkoutBranch as doCheckout,
  createBranch as doCreate,
} from "../../api/commands";
import type { LocalBranch } from "../../api/commands";

interface Props {
  repoId: string;
  branches: LocalBranch[];
  current: LocalBranch | null;
  onAfterChange: () => void;
}

export function BranchPicker({ repoId, branches, current, onAfterChange }: Props) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const filtered = branches.filter((b) =>
    b.name.toLowerCase().includes(filter.toLowerCase()),
  );

  const switchTo = async (name: string) => {
    if (name === current?.name) {
      setOpen(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await doCheckout(repoId, name);
      setOpen(false);
      setFilter("");
      onAfterChange();
    } catch (e) {
      setError((e as { message?: string })?.message ?? "Failed to switch branch.");
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await doCreate(repoId, newName.trim(), undefined, true);
      setNewName("");
      setCreating(false);
      setOpen(false);
      onAfterChange();
    } catch (e) {
      setError((e as { message?: string })?.message ?? "Failed to create branch.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-sm hover:bg-[var(--color-surface-hover)] cursor-pointer disabled:opacity-50"
        disabled={busy}
      >
        <GitBranch size={14} />
        <span className="max-w-[160px] truncate">{current?.name ?? "—"}</span>
        <ChevronDown size={13} className="text-[var(--color-fg-muted)]" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-40 mt-1 w-72 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-canvas)] shadow-xl">
          {/* Search / filter */}
          <div className="border-b border-[var(--color-border-muted)] p-2">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-fg-muted)]" />
              <input
                autoFocus
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Find or create a branch…"
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-canvas-inset)] py-1.5 pl-8 pr-2 text-sm outline-none focus:border-[var(--color-accent)]"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && filtered.length === 1) switchTo(filtered[0].name);
                }}
              />
            </div>
          </div>

          {/* Branch list */}
          <ul className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 && !creating && (
              <li className="px-3 py-2 text-xs text-[var(--color-fg-muted)]">
                No branches match “{filter}”.
              </li>
            )}
            {filtered.map((b) => (
              <li key={b.name}>
                <button
                  onClick={() => switchTo(b.name)}
                  disabled={busy}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-[var(--color-surface-hover)] cursor-pointer disabled:opacity-50"
                >
                  <GitBranch size={13} className="shrink-0 text-[var(--color-fg-muted)]" />
                  <span className="min-w-0 flex-1 truncate">{b.name}</span>
                  {b.current && (
                    <Check size={13} className="shrink-0 text-[var(--color-success)]" />
                  )}
                  {!b.current && b.has_upstream && (b.ahead || b.behind) && (
                    <span className="shrink-0 text-[10px] text-[var(--color-fg-muted)]">
                      {b.ahead ? `↑${b.ahead}` : ""} {b.behind ? `↓${b.behind}` : ""}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>

          {/* Create new branch */}
          <div className="border-t border-[var(--color-border-muted)] p-2">
            {creating ? (
              <div className="flex items-center gap-1">
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="new-branch-name"
                  className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-canvas-inset)] px-2 py-1 text-sm outline-none focus:border-[var(--color-accent)]"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") create();
                    if (e.key === "Escape") setCreating(false);
                  }}
                />
                <button
                  onClick={create}
                  disabled={busy || !newName.trim()}
                  className="rounded-md bg-[var(--color-success-emphasis)] px-2 py-1 text-xs text-white disabled:opacity-50 cursor-pointer"
                >
                  Create
                </button>
              </div>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-fg-default)] cursor-pointer"
              >
                <Plus size={13} /> New branch from {current?.name ?? "HEAD"}
              </button>
            )}
          </div>

          {error && (
            <div className="border-t border-[var(--color-border-muted)] px-3 py-2 text-[11px] text-[var(--color-danger)]">
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Re-export so the toolbar can avoid an extra import line. */
export type { LocalBranch };
