import { create } from "zustand";
import type { LibraryFilters } from "../types";

const DEFAULT_FILTERS: LibraryFilters = {
  search: "",
  day: "all",
  source: "all",
  sort: "date-desc",
  view: "grid-compact",
};

interface LibraryFilterState {
  filters: LibraryFilters;
  setFilters: (next: LibraryFilters) => void;
  updateFilters: (patch: Partial<LibraryFilters>) => void;
  resetFilters: () => void;
}

export const useLibraryFilterStore = create<LibraryFilterState>((set) => ({
  filters: DEFAULT_FILTERS,
  setFilters: (filters) => set({ filters }),
  updateFilters: (patch) =>
    set((state) => ({
      filters: {
        ...state.filters,
        ...patch,
      },
    })),
  resetFilters: () => set({ filters: DEFAULT_FILTERS }),
}));
