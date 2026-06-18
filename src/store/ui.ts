/**
 * UI state — the currently selected repo, active tab, and open dialog.
 * Persisted to localStorage so the app reopens where you left off.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Tab = "changes" | "history" | "branches" | "pulls";

export type Dialog =
  | { kind: "none" }
  | { kind: "clone" }
  | { kind: "add-local" }
  | { kind: "add-account" };

interface UiState {
  /** id of the selected LocalRepo, or null when none is open. */
  activeRepoId: string | null;
  tab: Tab;
  dialog: Dialog;

  setActiveRepo: (id: string | null) => void;
  setTab: (tab: Tab) => void;
  openDialog: (dialog: Exclude<Dialog, { kind: "none" }>) => void;
  closeDialog: () => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      activeRepoId: null,
      tab: "changes",
      dialog: { kind: "none" },

      // Switching repos resets to the Changes tab — the most common landing spot.
      setActiveRepo: (id) => set({ activeRepoId: id, tab: "changes" }),
      setTab: (tab) => set({ tab }),
      openDialog: (dialog) => set({ dialog }),
      closeDialog: () => set({ dialog: { kind: "none" } }),
    }),
    {
      name: "gitea-desktop-ui",
      partialize: ({ activeRepoId, tab }) => ({ activeRepoId, tab }),
    },
  ),
);
