/** Tab bar: Changes / History / Branches / Pull requests. */
import { CheckCircle2, GitBranch, GitPullRequest, History } from "lucide-react";
import { useUiStore } from "../../store/ui";
import type { Tab } from "../../store/ui";
import { cn } from "../../lib/cn";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "changes", label: "Changes", icon: <CheckCircle2 size={14} /> },
  { id: "history", label: "History", icon: <History size={14} /> },
  { id: "branches", label: "Branches", icon: <GitBranch size={14} /> },
  { id: "pulls", label: "Pull requests", icon: <GitPullRequest size={14} /> },
];

export function TabBar() {
  const tab = useUiStore((s) => s.tab);
  const setTab = useUiStore((s) => s.setTab);
  const activeRepoId = useUiStore((s) => s.activeRepoId);
  const disabled = !activeRepoId;

  return (
    <nav className="flex shrink-0 items-center gap-1 border-b border-[var(--color-border-muted)] bg-[var(--color-canvas)] px-2">
      {TABS.map((t) => (
        <button
          key={t.id}
          disabled={disabled}
          onClick={() => setTab(t.id)}
          className={cn(
            "flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm transition-colors",
            tab === t.id
              ? "border-[var(--color-accent)] text-[var(--color-fg-default)] font-medium"
              : "border-transparent text-[var(--color-fg-muted)] hover:text-[var(--color-fg-default)]",
            disabled && "opacity-40 cursor-not-allowed",
            !disabled && "cursor-pointer",
          )}
        >
          {t.icon}
          {t.label}
        </button>
      ))}
    </nav>
  );
}
