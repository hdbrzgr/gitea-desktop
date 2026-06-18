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
  | { kind: "add-account" }
  | { kind: "submodules" };

interface UiState {
  /** id of the selected LocalRepo, or null when none is open. */
  activeRepoId: string | null;
  /** When set, operations target this submodule path within the active repo
   * instead of the superproject root. Cleared when switching repos. */
  activeSubmodule: string | null;
  tab: Tab;
  dialog: Dialog;

  setActiveRepo: (id: string | null) => void;
  setActiveSubmodule: (subPath: string | null) => void;
  setTab: (tab: Tab) => void;
  openDialog: (dialog: Exclude<Dialog, { kind: "none" }>) => void;
  closeDialog: () => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      activeRepoId: null,
      activeSubmodule: null,
      tab: "changes",
      dialog: { kind: "none" },

      // Switching repos resets to the Changes tab and clears any selected
      // submodule scope.
      setActiveRepo: (id) =>
        set({ activeRepoId: id, activeSubmodule: null, tab: "changes" }),
      setActiveSubmodule: (subPath) => set({ activeSubmodule: subPath }),
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
