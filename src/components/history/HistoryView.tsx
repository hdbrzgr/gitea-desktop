/** The "History" tab: a paginated commit list with a detail pane showing
 * files changed + per-file diffs. */
import { useCallback, useEffect, useState } from "react";
import { Loader2, AlertCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { gitLog, type LogEntry } from "../../api/commands";
import type { AppError } from "../../api/types";
import { CommitDetail } from "./CommitDetail";
import { relativeTime, shortSha as _shortSha } from "../../lib/format";
import { cn } from "../../lib/cn";

const PAGE_SIZE = 50;

interface Props {
  repoId: string;
}

export function HistoryView({ repoId }: Props) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [selectedSha, setSelectedSha] = useState<string | null>(null);

  const load = useCallback(
    async (p: number) => {
      setLoading(true);
      setError(null);
      try {
        const result = await gitLog(repoId, p, PAGE_SIZE);
        setEntries(result);
        // Auto-select the first commit on first load.
        if (result.length > 0 && p === 1) {
          setSelectedSha(result[0].sha);
        }
      } catch (e) {
        setError(e as AppError);
        setEntries([]);
      } finally {
        setLoading(false);
      }
    },
    [repoId],
  );

  useEffect(() => {
    setPage(1);
    setSelectedSha(null);
    load(1);
  }, [load]);

  const selected = entries.find((e) => e.sha === selectedSha) ?? null;

  return (
    <div className="flex min-h-0 flex-1 bg-[var(--color-canvas)]">
      {/* Commit list */}
      <div className="flex w-96 shrink-0 flex-col border-r border-[var(--color-border-muted)]">
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--color-border-muted)] px-4 py-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-fg-muted)]">
            History
          </span>
          <Pager
            page={page}
            disabled={loading || entries.length < PAGE_SIZE}
            onPrev={() => {
              const p = Math.max(1, page - 1);
              setPage(p);
              load(p);
            }}
            onNext={() => {
              const p = page + 1;
              setPage(p);
              load(p);
            }}
          />
        </div>

        {error && (
          <div className="m-3 flex items-center gap-2 rounded-md border border-[var(--color-danger)] bg-[var(--color-danger)]/10 px-3 py-2 text-xs text-[var(--color-danger)]">
            <AlertCircle size={14} /> {error.message}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading && entries.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-[var(--color-fg-muted)]">
              <Loader2 size={16} className="animate-spin" /> Loading…
            </div>
          ) : (
            <ul>
              {entries.map((e) => (
                <li key={e.sha}>
                  <button
                    onClick={() => setSelectedSha(e.sha)}
                    className={cn(
                      "flex w-full flex-col gap-0.5 border-b border-[var(--color-border-muted)] px-4 py-2.5 text-left cursor-pointer",
                      e.sha === selectedSha
                        ? "bg-[var(--color-accent)]/15"
                        : "hover:bg-[var(--color-surface-hover)]",
                    )}
                  >
                    <span className="text-sm font-medium">{e.subject}</span>
                    <span className="flex items-center gap-2 text-[11px] text-[var(--color-fg-muted)]">
                      <span className="font-mono text-[var(--color-accent)]">
                        {_shortSha(e.sha)}
                      </span>
                      <span className="truncate">{e.author_name}</span>
                      <span>·</span>
                      <span>{relativeTime(e.author_date)}</span>
                    </span>
                    {e.refs.length > 0 && (
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {e.refs.map((r) => (
                          <span
                            key={r}
                            className="rounded-full bg-[var(--color-done)]/20 px-1.5 text-[10px] text-[var(--color-done)]"
                          >
                            {r}
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                </li>
              ))}
              {entries.length === 0 && !error && !loading && (
                <li className="px-4 py-10 text-center text-sm text-[var(--color-fg-muted)]">
                  No commits yet.
                </li>
              )}
            </ul>
          )}
        </div>
      </div>

      {/* Detail */}
      {selected ? (
        <CommitDetail
          repoId={repoId}
          commit={selected}
          onClose={() => setSelectedSha(null)}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-[var(--color-fg-muted)]">
          Select a commit to view details
        </div>
      )}
    </div>
  );
}

function Pager({
  page,
  disabled,
  onPrev,
  onNext,
}: {
  page: number;
  disabled: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={onPrev}
        disabled={disabled || page === 1}
        className="rounded p-1 text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-hover)] disabled:opacity-30 cursor-pointer"
        title="Previous page"
      >
        <ChevronLeft size={15} />
      </button>
      <span className="tnum text-[11px] text-[var(--color-fg-muted)]">P{page}</span>
      <button
        onClick={onNext}
        disabled={disabled}
        className="rounded p-1 text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-hover)] disabled:opacity-30 cursor-pointer"
        title="Next page"
      >
        <ChevronRight size={15} />
      </button>
    </div>
  );
}
