import { useMemo, useState } from "react";
import type { Asset } from "@/types";
import type { LibraryFilters } from "../types";

const DEFAULT_FILTERS: LibraryFilters = {
  search: "",
  day: "all",
  tag: "all",
};

export function useLibraryFilters(assets: Asset[]) {
  const [filters, setFilters] = useState<LibraryFilters>(DEFAULT_FILTERS);

  const filteredAssets = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    return assets.filter((asset) => {
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
  }, [assets, filters.day, filters.search, filters.tag]);

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
    filteredAssets,
    dayOptions,
    tagOptions,
  };
}
