/** Fetch / Pull / Push toolbar buttons with busy + error states. */
import { useState } from "react";
import { ArrowDown, ArrowUp, RefreshCw, Loader2 } from "lucide-react";
import { gitFetch, gitPull, gitPush } from "../../api/commands";
import { Button } from "../common/Button";

interface Props {
  repoId: string;
  ahead: number;
  behind: number;
  hasUpstream: boolean;
  onAfter: () => void;
}

type Op = "fetch" | "pull" | "push" | null;

export function SyncButtons({
  repoId,
  ahead,
  behind,
  hasUpstream,
  onAfter,
}: Props) {
  const [op, setOp] = useState<Op>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (which: Op) => {
    if (!which) return;
    setOp(which);
    setError(null);
    try {
      if (which === "fetch") await gitFetch(repoId);
      else if (which === "pull") await gitPull(repoId);
      else await gitPush(repoId);
      onAfter();
    } catch (e) {
      setError((e as { message?: string })?.message ?? `${which} failed.`);
    } finally {
      setOp(null);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => run("fetch")}
        disabled={op !== null}
        title="Fetch from origin"
      >
        {op === "fetch" ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => run("pull")}
        disabled={op !== null || !hasUpstream}
        title={hasUpstream ? "Pull from origin" : "No upstream set — push first"}
      >
        {op === "pull" ? <Loader2 size={14} className="animate-spin" /> : <ArrowDown size={14} />}
        Pull
        {behind > 0 && (
          <span className="tnum rounded-full bg-[var(--color-attention)]/20 px-1 text-[10px] text-[var(--color-attention)]">
            {behind}
          </span>
        )}
      </Button>
      <Button
        variant="primary"
        size="sm"
        onClick={() => run("push")}
        disabled={op !== null}
        title="Push current branch to origin"
      >
        {op === "push" ? <Loader2 size={14} className="animate-spin" /> : <ArrowUp size={14} />}
        Push
        {ahead > 0 && (
          <span className="tnum rounded-full bg-[var(--color-success)]/20 px-1 text-[10px] text-[var(--color-success)]">
            {ahead}
          </span>
        )}
      </Button>
      {error && (
        <span className="ml-1 max-w-[200px] truncate text-[11px] text-[var(--color-danger)]" title={error}>
          {error}
        </span>
      )}
    </div>
  );
}
