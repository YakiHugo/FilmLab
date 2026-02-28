import { useMemo } from "react";
import type { Asset } from "@/types";
import { useLibraryFilterStore } from "./useLibraryFilterStore";

export function useLibraryFilters(assets: Asset[]) {
  const filters = useLibraryFilterStore((state) => state.filters);
  const setFilters = useLibraryFilterStore((state) => state.setFilters);
  const updateFilters = useLibraryFilterStore((state) => state.updateFilters);
  const resetFilters = useLibraryFilterStore((state) => state.resetFilters);

  const filteredAssets = useMemo(() => {
    const search = filters.search.trim().toLowerCase();

    const matched = assets.filter((asset) => {
      const day = asset.importDay || asset.createdAt.slice(0, 10);
      const tags = asset.tags ?? [];
      const matchesSearch =
        !search ||
        asset.name.toLowerCase().includes(search) ||
        tags.some((tag) => tag.toLowerCase().includes(search));
      const matchesDay = filters.day === "all" || day === filters.day;
      const matchesTag = filters.tag === "all" || tags.includes(filters.tag);
      return matchesSearch && matchesDay && matchesTag;
    });

    return matched.sort((a, b) => {
      switch (filters.sort) {
        case "name-asc":
          return a.name.localeCompare(b.name);
        case "name-desc":
          return b.name.localeCompare(a.name);
        case "size-asc":
          return a.size - b.size;
        case "size-desc":
          return b.size - a.size;
        case "date-asc":
          return a.createdAt.localeCompare(b.createdAt);
        case "date-desc":
        default:
          return b.createdAt.localeCompare(a.createdAt);
      }
    });
  }, [assets, filters.day, filters.search, filters.sort, filters.tag]);

  const dayOptions = useMemo(() => {
    const values = new Set<string>();
    for (const asset of assets) {
      values.add(asset.importDay || asset.createdAt.slice(0, 10));
    }
    return ["all", ...Array.from(values).sort((a, b) => b.localeCompare(a))];
  }, [assets]);

  const tagOptions = useMemo(() => {
    const values = new Set<string>();
    for (const asset of assets) {
      for (const tag of asset.tags ?? []) {
        values.add(tag);
      }
    }
    return ["all", ...Array.from(values).sort((a, b) => a.localeCompare(b))];
  }, [assets]);

  return {
    filters,
    setFilters,
    updateFilters,
    resetFilters,
    filteredAssets,
    dayOptions,
    tagOptions,
  };
}
