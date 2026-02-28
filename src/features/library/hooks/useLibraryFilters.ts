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
      const source = asset.source ?? "imported";
      const matchesSearch =
        !search ||
        asset.name.toLowerCase().includes(search) ||
        tags.some((tag) => tag.toLowerCase().includes(search));
      const matchesDay = filters.day === "all" || day === filters.day;
      const matchesSource = filters.source === "all" || source === filters.source;
      return matchesSearch && matchesDay && matchesSource;
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
  }, [assets, filters.day, filters.search, filters.sort, filters.source]);

  const dayOptions = useMemo(() => {
    const values = new Map<string, number>();
    for (const asset of assets) {
      const day = asset.importDay || asset.createdAt.slice(0, 10);
      values.set(day, (values.get(day) ?? 0) + 1);
    }
    return [{ value: "all", count: assets.length }, ...Array.from(values.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([value, count]) => ({ value, count }))];
  }, [assets]);

  return {
    filters,
    setFilters,
    updateFilters,
    resetFilters,
    filteredAssets,
    dayOptions,
  };
}
