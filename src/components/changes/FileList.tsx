/** Left pane: the list of changed files. A file appears in the "Unstaged"
 * section when it has worktree changes, and in "Staged" when staged.
 * Clicking selects it for the diff viewer; per-file actions (stage, unstage,
 * discard) live on hover. */
import { useMemo } from "react";
import {
  ChevronRight,
  FileEdit,
  FilePlus,
  FileMinus,
  FileDiff,
  RotateCcw,
  Plus,
  Minus,
} from "lucide-react";
import type { FileChange, FileStatus } from "../../api/types";
import { basename, dirname } from "../../lib/format";
import { cn } from "../../lib/cn";

interface Props {
  files: FileChange[];
  selected: string | null;
  onSelect: (path: string) => void;
  onStage: (path: string) => void;
  onUnstage: (path: string) => void;
  onDiscard: (path: string, untracked: boolean) => void;
}

/** A file is "staged" if its X (index) code is set and not just a worktree
 * (Y) change. We split into staged vs unstaged buckets accordingly. */
function isStaged(f: FileChange): boolean {
  // '?' (untracked) and ' ' and '!' are not staged. Anything else in X means
  // there's a staged change.
  const x = f.x;
  return x !== " " && x !== "?" && x !== "!";
}

export function FileList({
  files,
  selected,
  onSelect,
  onStage,
  onUnstage,
  onDiscard,
}: Props) {
  const { staged, unstaged } = useMemo(() => {
    const staged: FileChange[] = [];
    const unstaged: FileChange[] = [];
    for (const f of files) {
      if (isStaged(f)) staged.push(f);
      // A file can be BOTH staged and have further worktree changes (e.g.
      // staged then modified again). Detect that: Y is not ' '.
      if (!isStaged(f) || (f.y !== " " && f.y !== "?")) {
        // Only show in unstaged if there's a real worktree change *beyond*
        // what's staged. For untracked files (??), Y='?' means unstaged.
        if (f.x === "?") {
          unstaged.push(f);
        } else if (f.y !== " " && f.y !== "" && f.y !== "?") {
          unstaged.push(f);
        }
      }
    }
    return { staged, unstaged };
  }, [files]);

  return (
    <div className="flex w-80 shrink-0 flex-col border-r border-[var(--color-border-muted)] bg-[var(--color-canvas)]">
      <Section
        title="Staged changes"
        count={staged.length}
        empty="No staged changes"
      >
        {staged.map((f) => (
          <FileRow
            key={"s:" + f.path}
            file={f}
            selected={selected === f.path}
            onSelect={() => onSelect(f.path)}
            action={
              <ActionButton
                title="Unstage"
                onClick={(e) => {
                  e.stopPropagation();
                  onUnstage(f.path);
                }}
              >
                <Minus size={13} />
              </ActionButton>
            }
          />
        ))}
      </Section>

      <Section
        title="Unstaged changes"
        count={unstaged.length}
        empty="No unstaged changes"
      >
        {unstaged.map((f) => (
          <FileRow
            key={"u:" + f.path}
            file={f}
            selected={selected === f.path}
            onSelect={() => onSelect(f.path)}
            action={
              <div className="flex items-center">
                <ActionButton
                  title="Discard changes"
                  destructive
                  onClick={(e) => {
                    e.stopPropagation();
                    onDiscard(f.path, f.status === "untracked");
                  }}
                >
                  <RotateCcw size={13} />
                </ActionButton>
                <ActionButton
                  title="Stage"
                  onClick={(e) => {
                    e.stopPropagation();
                    onStage(f.path);
                  }}
                >
                  <Plus size={13} />
                </ActionButton>
              </div>
            }
          />
        ))}
      </Section>
    </div>
  );
}

function Section({
  title,
  count,
  empty,
  children,
}: {
  title: string;
  count: number;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col border-b border-[var(--color-border-muted)] last:border-b-0">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-fg-muted)]">
          {title}
        </span>
        <span className="tnum rounded-full bg-[var(--color-surface)] px-1.5 text-[10px] text-[var(--color-fg-muted)]">
          {count}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-2">
        {count === 0 ? (
          <div className="px-3 py-2 text-xs text-[var(--color-fg-subtle)]">{empty}</div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

function FileRow({
  file,
  selected,
  onSelect,
  action,
}: {
  file: FileChange;
  selected: boolean;
  onSelect: () => void;
  action: React.ReactNode;
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "group flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm cursor-pointer",
        selected
          ? "bg-[var(--color-accent)]/15"
          : "hover:bg-[var(--color-surface-hover)]",
      )}
    >
      <StatusIcon status={file.status} />
      <div className="min-w-0 flex-1">
        <div className="truncate">{basename(file.path)}</div>
        {dirname(file.path) && (
          <div className="truncate text-[10px] text-[var(--color-fg-muted)]">
            {dirname(file.path)}
          </div>
        )}
      </div>
      <div className="opacity-0 transition-opacity group-hover:opacity-100">
        {action}
      </div>
    </button>
  );
}

function StatusIcon({ status }: { status: FileStatus }) {
  const cls = "text-[var(--color-fg-muted)] shrink-0";
  switch (status) {
    case "added":
      return <FilePlus size={14} className={cls + " text-[var(--color-success)]"} />;
    case "deleted":
      return <FileMinus size={14} className={cls + " text-[var(--color-danger)]"} />;
    case "renamed":
      return <ChevronRight size={14} className={cls} />;
    case "untracked":
      return <FilePlus size={14} className={cls + " text-[var(--color-attention)]"} />;
    case "conflicted":
      return <FileEdit size={14} className={cls + " text-[var(--color-attention)]"} />;
    case "copied":
      return <FileDiff size={14} className={cls} />;
    default:
      return <FileEdit size={14} className={cls + " text-[var(--color-attention)]"} />;
  }
}

function ActionButton({
  title,
  onClick,
  destructive,
  children,
}: {
  title: string;
  onClick: (e: React.MouseEvent) => void;
  destructive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={cn(
        "rounded p-1 cursor-pointer",
        destructive
          ? "text-[var(--color-fg-muted)] hover:bg-[var(--color-danger)]/20 hover:text-[var(--color-danger)]"
          : "text-[var(--color-fg-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-fg-default)]",
      )}
    >
      {children}
    </button>
  );
}
