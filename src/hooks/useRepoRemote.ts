/** Derives the (accountId, owner, repo) triple for a local repo, needed to
 * call Gitea API endpoints like PRs/branches. Returns nulls when the repo
 * has no matched account or no parseable remote. */
import { useReposStore } from "../store/repos";

export interface RepoRemote {
  accountId: string;
  owner: string;
  repo: string;
}

export function useRepoRemote(repoId: string | null): RepoRemote | null {
  const repos = useReposStore((s) => s.repos);
  if (!repoId) return null;
  const r = repos.find((x) => x.id === repoId);
  if (!r?.account_id || !r?.full_name) return null;
  const [owner, name] = r.full_name.split("/");
  if (!owner || !name) return null;
  return { accountId: r.account_id, owner, repo: name };
}
