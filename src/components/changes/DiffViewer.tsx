/** Renders a unified-diff for a single file path, with staged/untracked
 * awareness. Lines are colored by kind; line numbers come from the parser. */
import { useEffect, useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { gitDiff } from "../../api/commands";
import { countChanges, parseDiff } from "../../lib/diff";
import type { AppError, FileStatus } from "../../api/types";

interface Props {
  repoId: string;
  path: string;
  /** True when the file is fully staged (we diff index vs HEAD). */
  staged: boolean;
  status: FileStatus;
  subPath?: string | null;
}

export function DiffViewer({ repoId, path, staged, status, subPath }: Props) {
  const [diff, setDiff] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const untracked = status === "untracked";
    gitDiff(repoId, path, staged, untracked, subPath ?? undefined)
      .then((d) => {
        if (!cancelled) setDiff(d);
      })
      .catch((e: AppError) => {
        if (!cancelled) setError(e?.message ?? "Failed to load diff.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [repoId, path, staged, status]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-sm text-[var(--color-fg-muted)]">
        <Loader2 size={16} className="animate-spin" /> Loading diff…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 px-6 text-sm text-[var(--color-danger)]">
        <AlertCircle size={16} /> {error}
      </div>
    );
  }

  if (!diff || diff.trim() === "") {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-[var(--color-fg-muted)]">
        No changes to display.
      </div>
    );
  }

  const parsed = parseDiff(diff);
  const { added, removed } = countChanges(parsed);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-[var(--color-border-muted)] px-4 py-2 text-xs">
        <span className="font-mono">{path}</span>
        <span className="text-[var(--color-success)]">+{added}</span>
        <span className="text-[var(--color-danger)]">−{removed}</span>
      </div>

      {/* Diff body */}
      <div className="min-h-0 flex-1 overflow-auto bg-[var(--color-canvas-inset)]">
        <pre className="selectable w-fit min-w-full font-mono text-[12px] leading-[1.5]">
          {parsed.hunks.map((h, hi) => (
            <div key={hi}>
              {h.lines.map((l, li) => (
                <DiffLineRow key={li} line={l} />
              ))}
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}

function DiffLineRow({ line }: { line: import("../../lib/diff").DiffLine }) {
  let bg = "";
  let prefix = " ";
  let textClass = "text-[var(--color-fg-default)]";
  if (line.kind === "add") {
    bg = "bg-[var(--color-success)]/12";
    prefix = "+";
    textClass = "text-[var(--color-success)]";
  } else if (line.kind === "remove") {
    bg = "bg-[var(--color-danger)]/12";
    prefix = "-";
    textClass = "text-[var(--color-danger)]";
  } else if (line.kind === "hunk") {
    bg = "bg-[var(--color-accent)]/10";
    textClass = "text-[var(--color-accent)]";
  }

  return (
    <div className={"flex " + bg}>
      <span className="w-10 shrink-0 select-none border-r border-[var(--color-border-muted)] pr-2 text-right text-[var(--color-fg-subtle)]">
        {line.kind === "hunk" ? "" : line.oldNo ?? ""}
      </span>
      <span className="w-10 shrink-0 select-none border-r border-[var(--color-border-muted)] pr-2 text-right text-[var(--color-fg-subtle)]">
        {line.kind === "hunk" ? "" : line.newNo ?? ""}
      </span>
      <span className={"w-4 shrink-0 select-none text-center " + textClass}>
        {line.kind === "hunk" ? "@" : prefix}
      </span>
      <span className={"whitespace-pre px-2 " + textClass}>{line.text}</span>
    </div>
  );
}
