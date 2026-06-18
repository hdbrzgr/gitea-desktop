/** Modal dialog shell. Renders a backdrop + centered panel. */
import type { ReactNode } from "react";
import { useEffect } from "react";
import { X } from "lucide-react";

interface DialogProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Optional footer (action buttons). */
  footer?: ReactNode;
  width?: "sm" | "md" | "lg";
}

const widthClasses = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-2xl",
};

export function Dialog({
  title,
  onClose,
  children,
  footer,
  width = "md",
}: DialogProps) {
  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`flex max-h-[85vh] w-full ${widthClasses[width]} flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-canvas)] shadow-2xl`}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-[var(--color-border-muted)] px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-fg-default)] cursor-pointer"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer && (
          <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--color-border-muted)] bg-[var(--color-canvas-inset)] px-4 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
