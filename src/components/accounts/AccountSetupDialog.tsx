/** Add-account dialog: enters a Gitea instance URL + token, verifies against
 * the Gitea `/user` endpoint (in Rust), and persists via the keyring. */
import { useState } from "react";
import { Loader2, ExternalLink } from "lucide-react";
import { Dialog } from "../common/Dialog";
import { Button } from "../common/Button";
import { useAccountsStore } from "../../store/accounts";
import type { AppError } from "../../api/types";

interface Props {
  onClose: () => void;
}

export function AccountSetupDialog({ onClose }: Props) {
  const add = useAccountsStore((s) => s.add);
  const [url, setUrl] = useState("https://");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    const trimmedUrl = url.trim().replace(/\/+$/, "");
    const trimmedToken = token.trim();
    if (!trimmedUrl || !/^https?:\/\//.test(trimmedUrl)) {
      setError("Enter a valid URL starting with http(s)://");
      return;
    }
    if (!trimmedToken) {
      setError("Enter an access token.");
      return;
    }
    setBusy(true);
    try {
      await add(trimmedUrl, trimmedToken);
      onClose();
    } catch (e) {
      const err = e as AppError;
      setError(err?.message ?? "Failed to add account.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title="Connect to Gitea"
      onClose={onClose}
      width="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={busy}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : null}
            {busy ? "Verifying…" : "Sign in"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Gitea instance URL">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://gitea.example.com"
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-canvas-inset)] px-3 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]"
          />
        </Field>

        <Field
          label="Access token"
          help={
            <>
              Create one at{" "}
              <span className="text-[var(--color-fg-subtle)]">
                User Settings → Applications → Access Tokens
              </span>{" "}
              on your Gitea instance.
            </>
          }
        >
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="paste your token here"
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-canvas-inset)] px-3 py-1.5 text-sm font-mono outline-none focus:border-[var(--color-accent)]"
          />
        </Field>

        <a
          href="https://docs.gitea.com/development/api-usage"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-[var(--color-accent)] hover:underline"
        >
          How do I create a token? <ExternalLink size={11} />
        </a>

        {error && (
          <div className="rounded-md border border-[var(--color-danger)] bg-[var(--color-danger)]/10 px-3 py-2 text-xs text-[var(--color-danger)]">
            {error}
          </div>
        )}
      </div>
    </Dialog>
  );
}

function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1.5 text-xs font-medium text-[var(--color-fg-default)]">
        {label}
      </div>
      {children}
      {help && (
        <div className="mt-1 text-[11px] text-[var(--color-fg-muted)]">{help}</div>
      )}
    </label>
  );
}
