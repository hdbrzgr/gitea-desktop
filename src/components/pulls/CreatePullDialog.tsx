/** Create a pull request. Head defaults to the current local branch; base is
 * selectable from the repo's remote branches. Title/body are user-entered. */
import { useEffect, useState } from "react";
import { Loader2, AlertCircle, GitPullRequest } from "lucide-react";
import { Dialog } from "../common/Dialog";
import { Button } from "../common/Button";
import { createPull, listRemoteBranches } from "../../api/commands";
import type { AppError, GiteaBranch } from "../../api/types";

interface Props {
  onClose: () => void;
  onCreated: () => void;
  accountId: string;
  owner: string;
  repo: string;
  /** Default head branch (the current local branch). */
  defaultHead: string | null;
}

export function CreatePullDialog({
  onClose,
  onCreated,
  accountId,
  owner,
  repo,
  defaultHead,
}: Props) {
  const [branches, setBranches] = useState<GiteaBranch[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(true);
  const [head, setHead] = useState(defaultHead ?? "");
  const [base, setBase] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load remote branches for the base selector.
  useEffect(() => {
    let cancelled = false;
    setLoadingBranches(true);
    listRemoteBranches(accountId, owner, repo)
      .then((bs) => {
        if (cancelled) return;
        setBranches(bs);
        // Default base to 'main' if present, else the first branch.
        const fallback = bs.find((b) => b.name === "main") ?? bs[0];
        if (fallback) setBase(fallback.name);
      })
      .catch((e: AppError) => {
        if (!cancelled) setError(e?.message ?? "Failed to load branches.");
      })
      .finally(() => {
        if (!cancelled) setLoadingBranches(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accountId, owner, repo]);

  const submit = async () => {
    setError(null);
    if (!title.trim()) {
      setError("A title is required.");
      return;
    }
    if (!head.trim() || !base.trim()) {
      setError("Both head and base branches are required.");
      return;
    }
    if (head === base) {
      setError("Head and base must differ.");
      return;
    }
    setBusy(true);
    try {
      await createPull({
        accountId,
        owner,
        repo,
        title: title.trim(),
        body: body.trim() || undefined,
        head: head.trim(),
        base: base.trim(),
      });
      onCreated();
      onClose();
    } catch (e) {
      setError((e as AppError)?.message ?? "Failed to create pull request.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={`New pull request in ${owner}/${repo}`}
      onClose={onClose}
      width="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={busy}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <GitPullRequest size={14} />}
            {busy ? "Creating…" : "Create pull request"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="From (head)">
            <input
              value={head}
              onChange={(e) => setHead(e.target.value)}
              placeholder="feature-branch"
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-canvas-inset)] px-3 py-1.5 font-mono text-sm outline-none focus:border-[var(--color-accent)]"
            />
          </Field>
          <Field label="Into (base)">
            {loadingBranches ? (
              <div className="flex h-[34px] items-center gap-2 text-xs text-[var(--color-fg-muted)]">
                <Loader2 size={13} className="animate-spin" /> Loading branches…
              </div>
            ) : (
              <select
                value={base}
                onChange={(e) => setBase(e.target.value)}
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-canvas-inset)] px-2 py-1.5 font-mono text-sm outline-none focus:border-[var(--color-accent)]"
              >
                {branches.map((b) => (
                  <option key={b.name} value={b.name}>
                    {b.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>

        <Field label="Title">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Add a summary of what this changes"
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-canvas-inset)] px-3 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]"
          />
        </Field>

        <Field label="Description">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Describe the changes, rationale, testing notes…"
            rows={6}
            className="selectable w-full resize-none rounded-md border border-[var(--color-border)] bg-[var(--color-canvas-inset)] px-3 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]"
          />
        </Field>

        {error && (
          <div className="flex items-center gap-2 rounded-md border border-[var(--color-danger)] bg-[var(--color-danger)]/10 px-3 py-2 text-xs text-[var(--color-danger)]">
            <AlertCircle size={14} /> {error}
          </div>
        )}
      </div>
    </Dialog>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1.5 text-xs font-medium">{label}</div>
      {children}
    </label>
  );
}
