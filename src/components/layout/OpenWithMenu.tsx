/** "Open with" dropdown: reveals the repo (or active submodule) directory in
 * Terminal, VS Code, Cursor, Zed, or Finder. Only apps that are actually
 * installed on the machine are shown. */
import { useEffect, useRef, useState } from "react";
import {
  TerminalSquare,
  FolderOpen,
  ChevronDown,
  Code2,
  MousePointer2,
  SquareCode,
  AlertCircle,
} from "lucide-react";
import {
  detectOpenApps,
  openWith,
  type AppAvailability,
  type OpenTarget,
} from "../../api/commands";

interface Props {
  repoId: string;
  /** Active submodule path, or null for the superproject. */
  subPath?: string | null;
}

const ICONS: Record<OpenTarget, React.ReactNode> = {
  terminal: <TerminalSquare size={14} />,
  vscode: <Code2 size={14} />,
  cursor: <MousePointer2 size={14} />,
  zed: <SquareCode size={14} />,
  finder: <FolderOpen size={14} />,
};

export function OpenWithMenu({ repoId, subPath }: Props) {
  const [open, setOpen] = useState(false);
  const [apps, setApps] = useState<AppAvailability[]>([]);
  const [busy, setBusy] = useState<OpenTarget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Load installed apps when the menu first opens.
  useEffect(() => {
    if (!open || apps.length > 0) return;
    let cancelled = false;
    detectOpenApps()
      .then((list) => {
        if (!cancelled) setApps(list);
      })
      .catch(() => {
        if (!cancelled)
          setApps([
            { target: "finder", label: "Finder", available: true },
          ]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, apps.length]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const launch = async (target: OpenTarget) => {
    setBusy(target);
    setError(null);
    try {
      await openWith(repoId, target, subPath ?? null);
      setOpen(false);
    } catch (e) {
      setError((e as { message?: string })?.message ?? "Failed to open.");
    } finally {
      setBusy(null);
    }
  };

  const available = apps.filter((a) => a.available);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-sm hover:bg-[var(--color-surface-hover)] cursor-pointer"
        title="Open in another application"
      >
        <FolderOpen size={14} />
        <ChevronDown size={13} className="text-[var(--color-fg-muted)]" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 w-52 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-canvas)] py-1 shadow-xl">
          {apps.length === 0 ? (
            <div className="px-3 py-2 text-xs text-[var(--color-fg-muted)]">
              Checking installed apps…
            </div>
          ) : available.length === 0 ? (
            <div className="px-3 py-2 text-xs text-[var(--color-fg-muted)]">
              No supported editors found.
            </div>
          ) : (
            <>
              <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-fg-subtle)]">
                Open {subPath ? "submodule" : "repository"} in
              </div>
              {available.map((a) => (
                <button
                  key={a.target}
                  onClick={() => launch(a.target)}
                  disabled={busy !== null}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-[var(--color-surface-hover)] cursor-pointer disabled:opacity-50"
                >
                  <span className="text-[var(--color-fg-muted)]">
                    {ICONS[a.target]}
                  </span>
                  <span className="flex-1">{a.label}</span>
                  {busy === a.target && (
                    <span className="text-[10px] text-[var(--color-fg-muted)]">
                      opening…
                    </span>
                  )}
                </button>
              ))}
            </>
          )}
          {error && (
            <div className="mx-2 mt-1 flex items-start gap-1.5 rounded border border-[var(--color-danger)] bg-[var(--color-danger)]/10 px-2 py-1 text-[11px] text-[var(--color-danger)]">
              <AlertCircle size={12} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
