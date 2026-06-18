/** Commit composer: subject + optional extended description, with a commit
 * button that's disabled until there's a subject and at least one staged file. */
import { useState } from "react";
import { GitCommitHorizontal, Loader2 } from "lucide-react";
import { Button } from "../common/Button";

interface Props {
  stagedCount: number;
  branchName: string | null;
  busy: boolean;
  onCommit: (message: string) => Promise<void>;
}

export function CommitForm({ stagedCount, branchName, busy, onCommit }: Props) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const canCommit = subject.trim().length > 0 && stagedCount > 0 && !busy;

  const submit = async () => {
    if (!canCommit) return;
    const message = body.trim()
      ? `${subject.trim()}\n\n${body.trim()}`
      : subject.trim();
    await onCommit(message);
    setSubject("");
    setBody("");
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    // Cmd/Ctrl+Enter commits.
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="flex shrink-0 flex-col gap-2 border-t border-[var(--color-border-muted)] bg-[var(--color-canvas-inset)] p-3">
      <input
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Summary (required)"
        maxLength={72}
        className="rounded-md border border-[var(--color-border)] bg-[var(--color-canvas)] px-3 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Description (optional)"
        rows={3}
        className="selectable resize-none rounded-md border border-[var(--color-border)] bg-[var(--color-canvas)] px-3 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]"
      />
      <Button
        variant="primary"
        onClick={submit}
        disabled={!canCommit}
        className="w-full"
      >
        {busy ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <GitCommitHorizontal size={14} />
        )}
        {busy
          ? "Committing…"
          : stagedCount > 0
            ? `Commit to ${branchName ?? "HEAD"}`
            : "Stage files to commit"}
      </Button>
      <div className="text-center text-[10px] text-[var(--color-fg-subtle)]">
        ⌘/Ctrl+Enter to commit
      </div>
    </div>
  );
}
