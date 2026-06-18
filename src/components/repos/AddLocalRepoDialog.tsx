/** Add an existing local working copy to the app. Path is entered manually
 * (the OS folder picker plugin can be added later). */
import { useState } from "react";
import { Loader2, FolderOpen, AlertCircle } from "lucide-react";
import { Dialog } from "../common/Dialog";
import { Button } from "../common/Button";
import { useReposStore } from "../../store/repos";
import { useUiStore } from "../../store/ui";
import type { AppError } from "../../api/types";

interface Props {
  onClose: () => void;
}

export function AddLocalRepoDialog({ onClose }: Props) {
  const addLocal = useReposStore((s) => s.addLocal);
  const setActiveRepo = useUiStore((s) => s.setActiveRepo);
  const closeDialog = useUiStore((s) => s.closeDialog);
  const [path, setPath] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!path.trim()) {
      setError("Enter the path to a local git repository.");
      return;
    }
    setBusy(true);
    try {
      const repo = await addLocal(path.trim());
      setActiveRepo(repo.id);
      closeDialog();
    } catch (e) {
      setError((e as AppError)?.message ?? "Failed to add repository.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title="Add local repository"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={busy}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : null}
            {busy ? "Adding…" : "Add repository"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="block">
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium">
            <FolderOpen size={13} /> Local path
          </div>
          <input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="/Users/you/projects/my-repo"
            spellCheck={false}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-canvas-inset)] px-3 py-1.5 font-mono text-sm outline-none focus:border-[var(--color-accent)]"
          />
          <div className="mt-1 text-[11px] text-[var(--color-fg-muted)]">
            Path must point at the working copy (the folder containing{" "}
            <code>.git</code>).
          </div>
        </label>

        {error && (
          <div className="flex items-center gap-2 rounded-md border border-[var(--color-danger)] bg-[var(--color-danger)]/10 px-3 py-2 text-xs text-[var(--color-danger)]">
            <AlertCircle size={14} /> {error}
          </div>
        )}
      </div>
    </Dialog>
  );
}
