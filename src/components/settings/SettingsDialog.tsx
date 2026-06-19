/** Settings dialog. Currently exposes the default clone directory, with a
 * folder picker, reset-to-default, and live validation. */
import { useEffect, useState } from "react";
import { Loader2, FolderOpen, AlertCircle, RotateCcw } from "lucide-react";
import { Dialog } from "../common/Dialog";
import { Button } from "../common/Button";
import {
  getSettings,
  resetDefaultCloneDir,
  setDefaultCloneDir,
  type EffectiveSettings,
} from "../../api/commands";
import { pickDirectory } from "../../api/dialog";

interface Props {
  onClose: () => void;
}

export function SettingsDialog({ onClose }: Props) {
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState<EffectiveSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getSettings()
      .then((s) => {
        if (!cancelled) {
          setValue(s.defaultCloneDir);
          setSaved(s);
        }
      })
      .catch((e) => {
        if (!cancelled) setError((e as { message?: string })?.message ?? "Failed to load settings.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty = saved !== null && value.trim() !== saved.defaultCloneDir;

  const choose = async () => {
    setError(null);
    setPicking(true);
    try {
      const dir = await pickDirectory();
      if (dir) setValue(dir);
    } catch (e) {
      setError((e as { message?: string })?.message ?? "Failed to open folder picker.");
    } finally {
      setPicking(false);
    }
  };

  const save = async () => {
    setError(null);
    setBusy(true);
    try {
      const result = await setDefaultCloneDir(value.trim());
      setSaved(result);
      setValue(result.defaultCloneDir);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 1500);
    } catch (e) {
      setError((e as { message?: string })?.message ?? "Failed to save.");
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setError(null);
    setBusy(true);
    try {
      const result = await resetDefaultCloneDir();
      setSaved(result);
      setValue(result.defaultCloneDir);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 1500);
    } catch (e) {
      setError((e as { message?: string })?.message ?? "Failed to reset.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title="Settings"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Close
          </Button>
          <Button variant="primary" onClick={save} disabled={busy || !dirty}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : null}
            {justSaved ? "Saved" : "Save"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium">
            <FolderOpen size={13} /> Default clone directory
          </div>
          <div className="flex items-stretch gap-2">
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="/Users/you/Documents/Gitea"
              spellCheck={false}
              className="min-w-0 flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-canvas-inset)] px-3 py-1.5 font-mono text-sm outline-none focus:border-[var(--color-accent)]"
            />
            <Button
              variant="secondary"
              size="md"
              onClick={choose}
              disabled={busy || picking}
              className="shrink-0"
            >
              {picking ? <Loader2 size={14} className="animate-spin" /> : <FolderOpen size={14} />}
              {picking ? "…" : "Choose…"}
            </Button>
          </div>
          <div className="mt-1 text-[11px] text-[var(--color-fg-muted)]">
            New repositories are cloned here by default. Must be an absolute path.
          </div>
        </label>

        <button
          onClick={reset}
          disabled={busy}
          className="inline-flex items-center gap-1.5 text-xs text-[var(--color-fg-muted)] hover:text-[var(--color-fg-default)] cursor-pointer disabled:opacity-50"
        >
          <RotateCcw size={12} /> Reset to default (~/Documents/Gitea)
        </button>

        {error && (
          <div className="flex items-center gap-2 rounded-md border border-[var(--color-danger)] bg-[var(--color-danger)]/10 px-3 py-2 text-xs text-[var(--color-danger)]">
            <AlertCircle size={14} /> {error}
          </div>
        )}
      </div>
    </Dialog>
  );
}
