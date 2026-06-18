/** Loads local branches for the active repo (or a submodule), with manual
 * refetch. Mirrors `useGitStatus`'s deliberate-refresh pattern. */
import { useCallback, useEffect, useState } from "react";
import { listBranches } from "../api/commands";
import type { LocalBranch } from "../api/commands";
import type { AppError } from "../api/types";

export function useBranches(
  repoId: string | null,
  subPath: string | null = null,
) {
  const [branches, setBranches] = useState<LocalBranch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  const refetch = useCallback(async () => {
    if (!repoId) {
      setBranches([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const b = await listBranches(repoId, subPath ?? undefined);
      setBranches(b);
    } catch (e) {
      setError(e as AppError);
      setBranches([]);
    } finally {
      setLoading(false);
    }
  }, [repoId, subPath]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { branches, loading, error, refetch };
}
