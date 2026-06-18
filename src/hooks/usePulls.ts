/** Loads pull requests for a local repo's remote, with manual refetch.
 * Requires the repo to have a matched account (so we can hit the Gitea API). */
import { useCallback, useEffect, useState } from "react";
import { listPulls } from "../api/commands";
import type { GiteaPullRequest } from "../api/types";
import type { AppError } from "../api/types";

interface UsePullsResult {
  pulls: GiteaPullRequest[];
  loading: boolean;
  error: AppError | null;
  refetch: () => Promise<void>;
  /** True when the repo can't show PRs (no account or remote detected). */
  unavailable: boolean;
}

export function usePulls(
  accountId: string | null,
  owner: string | null,
  repo: string | null,
  state: "open" | "closed" | "all" = "open",
): UsePullsResult {
  const [pulls, setPulls] = useState<GiteaPullRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  const unavailable = !accountId || !owner || !repo;

  const refetch = useCallback(async () => {
    if (unavailable) {
      setPulls([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await listPulls(accountId!, owner!, repo!, state);
      setPulls(result);
    } catch (e) {
      setError(e as AppError);
      setPulls([]);
    } finally {
      setLoading(false);
    }
  }, [accountId, owner, repo, state, unavailable]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { pulls, loading, error, refetch, unavailable };
}
