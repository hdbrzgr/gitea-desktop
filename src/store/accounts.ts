/**
 * Account store — the source of truth for configured Gitea accounts in the
 * frontend. Mirrors what's persisted on disk by the Rust core; mutations go
 * through `api/commands.ts` which invokes the Rust command and we then
 * refresh from the canonical state.
 */
import { create } from "zustand";
import * as api from "../api/commands";
import type { Account, AppError } from "../api/types";

interface AccountsState {
  accounts: Account[];
  loading: boolean;
  error: AppError | null;

  refresh: () => Promise<void>;
  add: (url: string, token: string) => Promise<Account>;
  remove: (id: string) => Promise<void>;
}

export const useAccountsStore = create<AccountsState>((set, get) => ({
  accounts: [],
  loading: false,
  error: null,

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const accounts = await api.listAccounts();
      set({ accounts, loading: false });
    } catch (e) {
      set({ error: e as AppError, loading: false });
    }
  },

  add: async (url, token) => {
    const account = await api.addAccount({ url, token });
    await get().refresh();
    return account;
  },

  remove: async (id) => {
    await api.removeAccount(id);
    await get().refresh();
  },
}));
