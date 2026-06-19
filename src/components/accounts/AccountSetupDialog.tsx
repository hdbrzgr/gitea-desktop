/** Add-account dialog. Two sign-in methods, selected via a segmented control:
 *  - "Access token": URL + personal access token (the original flow)
 *  - "OAuth2": URL + client_id (+ optional secret for confidential clients),
 *    opens the system browser for authorization via a loopback callback
 *
 * Both paths produce a stored account; OAuth2 tokens are auto-refreshed. */
import { useState } from "react";
import { Loader2, ExternalLink, KeyRound, Globe } from "lucide-react";
import { Dialog } from "../common/Dialog";
import { Button } from "../common/Button";
import { useAccountsStore } from "../../store/accounts";
import type { AppError } from "../../api/types";
import { cn } from "../../lib/cn";

type Method = "token" | "oauth";

interface Props {
  onClose: () => void;
}

export function AccountSetupDialog({ onClose }: Props) {
  const [method, setMethod] = useState<Method>("token");

  // Shared fields
  const [url, setUrl] = useState("https://");

  // Token method
  const [token, setToken] = useState("");

  // OAuth2 method
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [confidential, setConfidential] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = useAccountsStore((s) => s.add);
  const addWithOauth = useAccountsStore((s) => s.addWithOauth);

  const normalizeUrl = () => url.trim().replace(/\/+$/, "");

  const submitToken = async () => {
    const trimmedUrl = normalizeUrl();
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
    setError(null);
    try {
      await add(trimmedUrl, trimmedToken);
      onClose();
    } catch (e) {
      setError((e as AppError)?.message ?? "Failed to add account.");
    } finally {
      setBusy(false);
    }
  };

  const submitOauth = async () => {
    const trimmedUrl = normalizeUrl();
    const trimmedId = clientId.trim();
    if (!trimmedUrl || !/^https?:\/\//.test(trimmedUrl)) {
      setError("Enter a valid URL starting with http(s)://");
      return;
    }
    if (!trimmedId) {
      setError("Enter the OAuth2 application's client_id.");
      return;
    }
    if (confidential && !clientSecret.trim()) {
      setError("Confidential clients require a client_secret.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await addWithOauth(
        trimmedUrl,
        trimmedId,
        confidential ? clientSecret.trim() : null,
      );
      onClose();
    } catch (e) {
      setError((e as AppError)?.message ?? "OAuth2 login failed.");
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
          <Button
            variant="primary"
            onClick={method === "token" ? submitToken : submitOauth}
            disabled={busy}
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : null}
            {busy
              ? method === "token"
                ? "Verifying…"
                : "Complete login in browser…"
              : method === "token"
                ? "Sign in"
                : "Authorize in browser"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Method segmented control */}
        <div className="flex rounded-md border border-[var(--color-border)] p-0.5 text-xs">
          <MethodButton
            active={method === "token"}
            onClick={() => { setMethod("token"); setError(null); }}
            icon={<KeyRound size={13} />}
            label="Access token"
          />
          <MethodButton
            active={method === "oauth"}
            onClick={() => { setMethod("oauth"); setError(null); }}
            icon={<Globe size={13} />}
            label="OAuth2"
          />
        </div>

        <Field label="Gitea instance URL">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://gitea.example.com"
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-canvas-inset)] px-3 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]"
          />
        </Field>

        {method === "token" ? (
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
        ) : (
          <OauthForm
            clientId={clientId}
            setClientId={setClientId}
            clientSecret={clientSecret}
            setClientSecret={setClientSecret}
            confidential={confidential}
            setConfidential={setConfidential}
          />
        )}

        <a
          href={
            method === "token"
              ? "https://docs.gitea.com/development/api-usage"
              : "https://docs.gitea.com/development/oauth2-provider"
          }
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-[var(--color-accent)] hover:underline"
        >
          {method === "token" ? "How do I create a token?" : "How do I set up an OAuth2 app?"}
          <ExternalLink size={11} />
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

function OauthForm({
  clientId,
  setClientId,
  clientSecret,
  setClientSecret,
  confidential,
  setConfidential,
}: {
  clientId: string;
  setClientId: (v: string) => void;
  clientSecret: string;
  setClientSecret: (v: string) => void;
  confidential: boolean;
  setConfidential: (v: boolean) => void;
}) {
  return (
    <div className="space-y-3">
      <Field
        label="Client ID"
        help={
          <>
            From the OAuth2 Application you created in Gitea:{" "}
            <span className="text-[var(--color-fg-subtle)]">
              User Settings → Applications → OAuth2 Applications
            </span>
            . Use redirect URI{" "}
            <code className="text-[var(--color-accent)]">http://127.0.0.1/</code>.
          </>
        }
      >
        <input
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          placeholder="e.g. 1a2b3c4d-..."
          spellCheck={false}
          className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-canvas-inset)] px-3 py-1.5 text-sm font-mono outline-none focus:border-[var(--color-accent)]"
        />
      </Field>

      {/* Public / Confidential toggle */}
      <label className="flex items-start gap-2 rounded-md border border-[var(--color-border-muted)] bg-[var(--color-canvas-inset)] px-3 py-2">
        <input
          type="checkbox"
          checked={confidential}
          onChange={(e) => setConfidential(e.target.checked)}
          className="mt-0.5"
        />
        <span className="text-xs">
          <span className="font-medium">Confidential client</span>
          <span className="block text-[var(--color-fg-muted)]">
            Enable if your Gitea OAuth2 app is marked confidential. You'll need
            to provide a client secret. Leave unchecked (default) for public
            PKCE clients — the recommended mode for desktop apps.
          </span>
        </span>
      </label>

      {confidential && (
        <Field label="Client secret">
          <input
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder="client secret"
            spellCheck={false}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-canvas-inset)] px-3 py-1.5 text-sm font-mono outline-none focus:border-[var(--color-accent)]"
          />
        </Field>
      )}
    </div>
  );
}

function MethodButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded px-2.5 py-1.5 cursor-pointer",
        active
          ? "bg-[var(--color-surface-hover)] text-[var(--color-fg-default)]"
          : "text-[var(--color-fg-muted)] hover:text-[var(--color-fg-default)]",
      )}
    >
      {icon}
      {label}
    </button>
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
