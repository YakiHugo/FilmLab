import { useMemo, useState } from "react";
import type { Asset } from "@/types";

export function useWorkspaceFiltering(assets: Asset[]) {
  const [searchText, setSearchText] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("all");

  const groupOptions = useMemo(() => {
    const groups = new Set<string>();
    assets.forEach((asset) => groups.add(asset.group ?? "未分组"));
    return Array.from(groups);
  }, [assets]);

  const normalizedSearch = searchText.trim().toLowerCase();
  const filteredAssets = useMemo(
    () =>
      assets.filter((asset) => {
        const group = asset.group ?? "未分组";
        if (selectedGroup !== "all" && group !== selectedGroup) {
          return false;
        }
        if (normalizedSearch && !asset.name.toLowerCase().includes(normalizedSearch)) {
          return false;
        }
        return true;
      }),
    [assets, normalizedSearch, selectedGroup]
  );

  const resetFilters = () => {
    setSearchText("");
    setSelectedGroup("all");
  };

  return {
    searchText,
    setSearchText,
    selectedGroup,
    setSelectedGroup,
    groupOptions,
    filteredAssets,
    resetFilters,
  };
}
