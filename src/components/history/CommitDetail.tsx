/** Right pane of the History tab: metadata + changed files for one commit,
 * with expandable per-file diffs (reuses the diff parser). */
import { useEffect, useState } from "react";
import { Loader2, AlertCircle, FileEdit, ChevronDown } from "lucide-react";
import {
  gitCommitFileDiff,
  gitCommitFiles,
  type CommitFile,
  type LogEntry,
} from "../../api/commands";
import { absoluteDate, basename, dirname, shortSha } from "../../lib/format";
import { parseDiff } from "../../lib/diff";
import { cn } from "../../lib/cn";

interface Props {
  repoId: string;
  commit: LogEntry;
  onClose: () => void;
}

export function CommitDetail({ repoId, commit }: Props) {
  const [files, setFiles] = useState<CommitFile[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [diffCache, setDiffCache] = useState<Record<string, string>>({});
  const [diffLoading, setDiffLoading] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setFiles(null);
    setExpanded(new Set());
    gitCommitFiles(repoId, commit.sha)
      .then((f) => {
        if (!cancelled) setFiles(f);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message ?? "Failed to load commit.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [repoId, commit.sha]);

  const toggleFile = async (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
    if (!diffCache[path] && !expanded.has(path)) {
      setDiffLoading(path);
      try {
        const diff = await gitCommitFileDiff(repoId, commit.sha, path);
        setDiffCache((c) => ({ ...c, [path]: diff }));
      } catch {
        // ignore; user can retry by collapsing/expanding
      } finally {
        setDiffLoading(null);
      }
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header / metadata */}
      <div className="shrink-0 border-b border-[var(--color-border-muted)] px-5 py-4">
        <div className="mb-1 text-sm font-semibold">{commit.subject}</div>
        {commit.body && (
          <pre className="selectable mb-2 whitespace-pre-wrap font-sans text-xs text-[var(--color-fg-muted)]">
            {commit.body}
          </pre>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--color-fg-muted)]">
          <span>
            <span className="font-medium text-[var(--color-fg-default)]">
              {commit.author_name}
            </span>{" "}
            committed {absoluteDate(commit.author_date)}
          </span>
          <span className="font-mono text-[var(--color-accent)]">
            {shortSha(commit.sha)}
          </span>
          {commit.refs.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {commit.refs.map((r) => (
                <span
                  key={r}
                  className="rounded-full bg-[var(--color-done)]/20 px-1.5 py-px text-[10px] text-[var(--color-done)]"
                >
                  {r}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Files */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-[var(--color-fg-muted)]">
            <Loader2 size={16} className="animate-spin" /> Loading files…
          </div>
        )}
        {error && (
          <div className="m-4 flex items-center gap-2 rounded-md border border-[var(--color-danger)] bg-[var(--color-danger)]/10 px-3 py-2 text-xs text-[var(--color-danger)]">
            <AlertCircle size={14} /> {error}
          </div>
        )}
        {files && (
          <ul className="divide-y divide-[var(--color-border-muted)]">
            {files.map((f) => {
              const isOpen = expanded.has(f.path);
              const diff = diffCache[f.path];
              const parsed = diff ? parseDiff(diff) : null;
              return (
                <li key={f.path}>
                  <button
                    onClick={() => toggleFile(f.path)}
                    className="flex w-full items-center gap-2 px-5 py-2 text-left text-sm hover:bg-[var(--color-surface-hover)] cursor-pointer"
                  >
                    <ChevronDown
                      size={13}
                      className={cn(
                        "shrink-0 text-[var(--color-fg-muted)] transition-transform",
                        !isOpen && "-rotate-90",
                      )}
                    />
                    <FileStatusIcon status={f.status} />
                    <div className="min-w-0 flex-1">
                      <span className="truncate">{basename(f.path)}</span>
                      {dirname(f.path) && (
                        <span className="ml-1 text-[10px] text-[var(--color-fg-muted)]">
                          {dirname(f.path)}
                        </span>
                      )}
                    </div>
                    {f.status !== "binary" && (
                      <span className="shrink-0 font-mono text-[11px]">
                        <span className="text-[var(--color-success)]">+{f.additions}</span>{" "}
                        <span className="text-[var(--color-danger)]">−{f.deletions}</span>
                      </span>
                    )}
                  </button>
                  {isOpen && (
                    <div className="border-t border-[var(--color-border-muted)] bg-[var(--color-canvas-inset)]">
                      {diffLoading === f.path ? (
                        <div className="flex items-center justify-center gap-2 py-4 text-xs text-[var(--color-fg-muted)]">
                          <Loader2 size={13} className="animate-spin" /> Loading diff…
                        </div>
                      ) : parsed ? (
                        <pre className="selectable overflow-x-auto font-mono text-[12px] leading-[1.5]">
                          {parsed.hunks.map((h, hi) => (
                            <div key={hi}>
                              {h.lines.map((l, li) => (
                                <DiffLine key={li} line={l} />
                              ))}
                            </div>
                          ))}
                        </pre>
                      ) : (
                        <div className="py-3 text-center text-xs text-[var(--color-fg-muted)]">
                          No diff available.
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function FileStatusIcon({ status }: { status: string }) {
  if (status === "binary") return <FileEdit size={13} className="text-[var(--color-fg-muted)]" />;
  return <FileEdit size={13} className="text-[var(--color-attention)]" />;
}

function DiffLine({ line }: { line: import("../../lib/diff").DiffLine }) {
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
      <span className={"w-4 shrink-0 select-none text-center " + textClass}>
        {line.kind === "hunk" ? "@" : prefix}
      </span>
      <span className={"whitespace-pre px-2 " + textClass}>{line.text}</span>
    </div>
  );
}
