import { useMemo, useState } from "react";
import { resolveAssetImportDay } from "@/stores/project/grouping";
import { hasAnyTag, normalizeTags } from "@/stores/project/tagging";
import type { Asset } from "@/types";

const toTagKey = (tag: string) => tag.toLocaleLowerCase();

export interface WorkspaceFilterCriteria {
  searchText: string;
  selectedDay: string;
  selectedTags: string[];
}

export const buildWorkspaceFilterOptions = (assets: Asset[]) => {
  const daySet = new Set<string>();
  const tagSet = new Set<string>();

  assets.forEach((asset) => {
    daySet.add(resolveAssetImportDay(asset));
    normalizeTags(asset.tags ?? []).forEach((tag) => tagSet.add(tag));
  });

  return {
    dayOptions: Array.from(daySet).sort((a, b) => b.localeCompare(a)),
    tagOptions: Array.from(tagSet).sort((a, b) => a.localeCompare(b, "zh-CN")),
  };
};

export const filterWorkspaceAssets = (assets: Asset[], criteria: WorkspaceFilterCriteria) => {
  const normalizedSearch = criteria.searchText.trim().toLowerCase();
  return assets.filter((asset) => {
    const day = resolveAssetImportDay(asset);
    if (criteria.selectedDay !== "all" && day !== criteria.selectedDay) {
      return false;
    }
    if (!hasAnyTag(asset.tags, criteria.selectedTags)) {
      return false;
    }
    if (normalizedSearch && !asset.name.toLowerCase().includes(normalizedSearch)) {
      return false;
    }
    return true;
  });
};

export function useWorkspaceFiltering(assets: Asset[]) {
  const [searchText, setSearchText] = useState("");
  const [selectedDay, setSelectedDay] = useState("all");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const { dayOptions, tagOptions } = useMemo(() => buildWorkspaceFilterOptions(assets), [assets]);

  const filteredAssets = useMemo(
    () =>
      filterWorkspaceAssets(assets, {
        searchText,
        selectedDay,
        selectedTags,
      }),
    [assets, searchText, selectedDay, selectedTags]
  );

  const toggleSelectedTag = (tag: string) => {
    const normalized = normalizeTags([tag])[0];
    if (!normalized) {
      return;
    }

    const key = toTagKey(normalized);
    setSelectedTags((prev) => {
      const prevNormalized = normalizeTags(prev);
      const exists = prevNormalized.some((item) => toTagKey(item) === key);
      if (exists) {
        return prevNormalized.filter((item) => toTagKey(item) !== key);
      }
      return normalizeTags([...prevNormalized, normalized]);
    });
  };

  const clearSelectedTags = () => {
    setSelectedTags([]);
  };

  const resetFilters = () => {
    setSearchText("");
    setSelectedDay("all");
    setSelectedTags([]);
  };

  return {
    searchText,
    setSearchText,
    selectedDay,
    setSelectedDay,
    dayOptions,
    selectedTags,
    setSelectedTags,
    toggleSelectedTag,
    clearSelectedTags,
    tagOptions,
    filteredAssets,
    resetFilters,
  };
}

