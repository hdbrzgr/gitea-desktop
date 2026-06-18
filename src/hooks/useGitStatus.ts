/** Loads and exposes working-directory status for the active repo (or a
 * submodule within it), with a manual refetch. We use a plain hook rather
 * than TanStack Query here because status must be refreshed deliberately
 * after every mutation (stage/unstage/discard/commit) — automatic polling
 * would race with the user's edits. */
import { useCallback, useEffect, useState } from "react";
import { gitStatus } from "../api/commands";
import type { AppError, GitStatus } from "../api/types";

export function useGitStatus(
  repoId: string | null,
  subPath: string | null = null,
) {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  const refetch = useCallback(async () => {
    if (!repoId) {
      setStatus(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const s = await gitStatus(repoId, subPath ?? undefined);
      setStatus(s);
    } catch (e) {
      setError(e as AppError);
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [repoId, subPath]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { status, loading, error, refetch };
}
