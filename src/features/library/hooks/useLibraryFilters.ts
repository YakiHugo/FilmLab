import { useMemo } from "react";
import type { Asset } from "@/types";
import { useDebouncedValue } from "./useDebouncedValue";
import { useLibraryFilterStore } from "./useLibraryFilterStore";

export function useLibraryFilters(assets: Asset[]) {
  const filters = useLibraryFilterStore((state) => state.filters);
  const updateFilters = useLibraryFilterStore((state) => state.updateFilters);
  const resetFilters = useLibraryFilterStore((state) => state.resetFilters);
  const debouncedSearch = useDebouncedValue(filters.search, 200);

  const visibleAssets = useMemo(
    () =>
      assets.filter((asset) => {
        const status = asset.remote?.status;
        return status !== "delete_queued" && status !== "deleting" && status !== "deleted";
      }),
    [assets]
  );

  const indexedAssets = useMemo(
    () =>
      visibleAssets.map((asset) => {
        const day = asset.importDay || asset.createdAt.slice(0, 10);
        const source = asset.source ?? "imported";
        const origin = asset.origin ?? "file";
        const searchIndex = asset.name.toLowerCase();
        const isLiked = (asset.tags ?? []).includes("liked");
        return {
          asset,
          day,
          source,
          origin,
          isLiked,
          searchIndex,
        };
      }),
    [visibleAssets]
  );

  const filteredAssets = useMemo(() => {
    const search = debouncedSearch.trim().toLowerCase();

    const matched = indexedAssets
      .filter((entry) => {
        const matchesSearch = !search || entry.searchIndex.includes(search);
        const matchesDay = filters.day === "all" || entry.day === filters.day;
        const matchesLiked = filters.liked === "all" || entry.isLiked;
        const matchesSource = filters.source === "all" || entry.source === filters.source;
        const matchesOrigin = filters.origin === "all" || entry.origin === filters.origin;
        return matchesSearch && matchesDay && matchesLiked && matchesSource && matchesOrigin;
      })
      .map((entry) => entry.asset);

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
  }, [
    debouncedSearch,
    filters.day,
    filters.liked,
    filters.origin,
    filters.sort,
    filters.source,
    indexedAssets,
  ]);

  const dayOptions = useMemo(() => {
    const values = new Map<string, number>();
    for (const entry of indexedAssets) {
      values.set(entry.day, (values.get(entry.day) ?? 0) + 1);
    }
    return [
      { value: "all", count: indexedAssets.length },
      ...Array.from(values.entries())
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([value, count]) => ({ value, count })),
    ];
  }, [indexedAssets]);

  return {
    filters,
    updateFilters,
    resetFilters,
    filteredAssets,
    dayOptions,
  };
}
