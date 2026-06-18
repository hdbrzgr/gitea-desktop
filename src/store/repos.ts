/**
 * Local repos store — mirrors the Rust-side `AppConfig.repos`. Mutations go
 * through `api/commands.ts`; after each we refresh from the canonical state.
 */
import { create } from "zustand";
import * as api from "../api/commands";
import type { AppError, LocalRepo } from "../api/types";

interface ReposState {
  repos: LocalRepo[];
  loading: boolean;
  error: AppError | null;

  refresh: () => Promise<void>;
  clone: (url: string, parentDir: string, accountId?: string) => Promise<LocalRepo>;
  addLocal: (path: string) => Promise<LocalRepo>;
  remove: (id: string) => Promise<void>;
}

export const useReposStore = create<ReposState>((set, get) => ({
  repos: [],
  loading: false,
  error: null,

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const repos = await api.listLocalRepos();
      set({ repos, loading: false });
    } catch (e) {
      set({ error: e as AppError, loading: false });
    }
  },

  clone: async (url, parentDir, accountId) => {
    const repo = await api.cloneRepo(url, parentDir, accountId);
    await get().refresh();
    return repo;
  },

  addLocal: async (path) => {
    const repo = await api.addLocalRepo(path);
    await get().refresh();
    return repo;
  },

  remove: async (id) => {
    await api.removeRepo(id);
    await get().refresh();
  },
}));
