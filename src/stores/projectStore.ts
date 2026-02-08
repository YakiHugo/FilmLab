import { create } from "zustand";
import { presets } from "@/data/presets";
import { createDefaultAdjustments } from "@/lib/adjustments";
import { prepareAssetPayload } from "@/lib/assetMetadata";
import type { Asset, Project } from "@/types";
import {
  clearAssets,
  loadAssets,
  loadProject,
  saveAsset,
  saveProject,
  type StoredAsset,
} from "@/lib/db";

export interface AddAssetsResult {
  added: number;
  failed: number;
  addedAssetIds: string[];
}

interface ProjectState {
  project: Project | null;
  assets: Asset[];
  presets: typeof presets;
  isLoading: boolean;
  isImporting: boolean;
  selectedAssetIds: string[];
  init: () => Promise<void>;
  addAssets: (files: File[]) => Promise<AddAssetsResult>;
  applyPresetToGroup: (
    group: string,
    presetId: string,
    intensity: number,
  ) => void;
  updatePresetForGroup: (group: string, presetId: string) => void;
  updateIntensityForGroup: (group: string, intensity: number) => void;
  applyPresetToSelection: (
    assetIds: string[],
    presetId: string,
    intensity: number,
  ) => void;
  updateAsset: (assetId: string, update: Partial<Asset>) => void;
  updateAssetOnly: (assetId: string, update: Partial<Asset>) => void;
  setSelectedAssetIds: (assetIds: string[]) => void;
  addToSelection: (assetIds: string[]) => void;
  toggleAssetSelection: (assetId: string) => void;
  removeFromSelection: (assetIds: string[]) => void;
  clearAssetSelection: () => void;
  resetProject: () => Promise<void>;
}

const defaultProject = (): Project => {
  const now = new Date().toISOString();
  return {
    id: "default-project",
    name: "FilmLab Project",
    createdAt: now,
    updatedAt: now,
  };
};

const revokeAssetUrls = (assets: Asset[]) => {
  assets.forEach((asset) => {
    if (asset.objectUrl) {
      URL.revokeObjectURL(asset.objectUrl);
    }
    if (asset.thumbnailUrl && asset.thumbnailUrl !== asset.objectUrl) {
      URL.revokeObjectURL(asset.thumbnailUrl);
    }
  });
};

const toStoredAsset = (asset: Asset): StoredAsset | null => {
  if (!asset.blob) {
    return null;
  }
  return {
    id: asset.id,
    name: asset.name,
    type: asset.type,
    size: asset.size,
    createdAt: asset.createdAt,
    blob: asset.blob,
    presetId: asset.presetId,
    intensity: asset.intensity,
    filmProfileId: asset.filmProfileId,
    filmOverrides: asset.filmOverrides,
    filmProfile: asset.filmProfile,
    group: asset.group,
    thumbnailBlob: asset.thumbnailBlob,
    metadata: asset.metadata,
    adjustments: asset.adjustments,
    aiRecommendation: asset.aiRecommendation,
  };
};

const persistAsset = (asset: Asset) => {
  const payload = toStoredAsset(asset);
  if (!payload) {
    return;
  }
  void saveAsset(payload);
};

export const useProjectStore = create<ProjectState>((set, get) => ({
  project: null,
  assets: [],
  presets,
  isLoading: true,
  isImporting: false,
  selectedAssetIds: [],
  init: async () => {
    set({ isLoading: true });
    const storedProject = await loadProject();
    const project = storedProject ?? defaultProject();
    if (!storedProject) {
      await saveProject(project);
    }

    const storedAssets = await loadAssets();
    const assets: Asset[] = storedAssets.map((asset, index) => {
      const objectUrl = URL.createObjectURL(asset.blob);
      const thumbnailUrl = asset.thumbnailBlob
        ? URL.createObjectURL(asset.thumbnailBlob)
        : objectUrl;
      const fallbackGroup = `Group ${(index % 4) + 1}`;
      const group = asset.group ?? fallbackGroup;
      return {
        id: asset.id,
        name: asset.name,
        type: asset.type,
        size: asset.size,
        createdAt: asset.createdAt,
        objectUrl,
        thumbnailUrl,
        presetId: asset.presetId,
        intensity: asset.intensity,
        filmProfileId: asset.filmProfileId,
        filmOverrides: asset.filmOverrides,
        filmProfile: asset.filmProfile,
        group,
        blob: asset.blob,
        thumbnailBlob: asset.thumbnailBlob,
        metadata: asset.metadata,
        adjustments: asset.adjustments ?? createDefaultAdjustments(),
        aiRecommendation: asset.aiRecommendation,
      };
    });

    const nextSelection = get().selectedAssetIds.filter((id) =>
      assets.some((asset) => asset.id === id),
    );

    revokeAssetUrls(get().assets);
    set({
      project,
      assets,
      isLoading: false,
      selectedAssetIds: nextSelection,
    });
  },
  addAssets: async (files: File[]) => {
    if (files.length === 0) {
      return {
        added: 0,
        failed: 0,
        addedAssetIds: [],
      };
    }
    set({ isImporting: true });
    try {
      const { assets, project } = get();
      const timestamp = new Date().toISOString();
      const newAssets: Asset[] = [];
      let failedCount = 0;

      for (const file of files) {
        try {
          const id = `${file.name}-${file.lastModified}-${Math.random().toString(16).slice(2)}`;
          const group = `Group ${((assets.length + newAssets.length) % 4) + 1}`;
          const { metadata, thumbnailBlob } = await prepareAssetPayload(file);
          const objectUrl = URL.createObjectURL(file);
          const thumbnailUrl = thumbnailBlob
            ? URL.createObjectURL(thumbnailBlob)
            : objectUrl;

          const asset: Asset = {
            id,
            name: file.name,
            type: file.type,
            size: file.size,
            createdAt: timestamp,
            objectUrl,
            thumbnailUrl,
            presetId: presets[0]?.id,
            intensity: presets[0]?.intensity,
            filmProfileId: presets[0]?.filmProfileId,
            filmProfile: presets[0]?.filmProfile,
            group,
            blob: file,
            thumbnailBlob,
            metadata,
            adjustments: createDefaultAdjustments(),
          };

          const payload = toStoredAsset(asset);
          if (payload) {
            void saveAsset(payload).catch((error) => {
              console.warn("Failed to persist imported asset", error);
            });
          }
          newAssets.push(asset);
        } catch (error) {
          console.warn("Failed to import asset", file.name, error);
          failedCount += 1;
        }
      }
      if (newAssets.length === 0) {
        return {
          added: 0,
          failed: failedCount || files.length,
          addedAssetIds: [],
        };
      }

      const updatedProject = project
        ? { ...project, updatedAt: timestamp }
        : defaultProject();
      void saveProject(updatedProject).catch((error) => {
        console.warn("Failed to persist project after import", error);
      });
      set({
        project: updatedProject,
        assets: [...assets, ...newAssets],
      });
      return {
        added: newAssets.length,
        failed: failedCount,
        addedAssetIds: newAssets.map((asset) => asset.id),
      };
    } finally {
      set({ isImporting: false });
    }
  },
  applyPresetToGroup: (group, presetId, intensity) => {
    const selectedPreset = presets.find((preset) => preset.id === presetId);
    const nextAssets = get().assets.map((asset) =>
      asset.group === group
        ? {
            ...asset,
            presetId,
            intensity,
            filmProfileId: selectedPreset?.filmProfileId,
            filmOverrides: undefined,
            filmProfile: selectedPreset?.filmProfile,
          }
        : asset,
    );
    nextAssets
      .filter((asset) => asset.group === group)
      .forEach((asset) => persistAsset(asset));
    set({ assets: nextAssets });
  },
  updatePresetForGroup: (group, presetId) => {
    const selectedPreset = presets.find((preset) => preset.id === presetId);
    const nextAssets = get().assets.map((asset) =>
      asset.group === group
        ? {
            ...asset,
            presetId,
            filmProfileId: selectedPreset?.filmProfileId,
            filmOverrides: undefined,
            filmProfile: selectedPreset?.filmProfile,
          }
        : asset,
    );
    nextAssets
      .filter((asset) => asset.group === group)
      .forEach((asset) => persistAsset(asset));
    set({ assets: nextAssets });
  },
  updateIntensityForGroup: (group, intensity) => {
    const nextAssets = get().assets.map((asset) =>
      asset.group === group ? { ...asset, intensity } : asset,
    );
    nextAssets
      .filter((asset) => asset.group === group)
      .forEach((asset) => persistAsset(asset));
    set({ assets: nextAssets });
  },
  applyPresetToSelection: (assetIds, presetId, intensity) => {
    const selectedSet = new Set(assetIds);
    const selectedPreset = presets.find((preset) => preset.id === presetId);
    const nextAssets = get().assets.map((asset) =>
      selectedSet.has(asset.id)
        ? {
            ...asset,
            presetId,
            intensity,
            filmProfileId: selectedPreset?.filmProfileId,
            filmOverrides: undefined,
            filmProfile: selectedPreset?.filmProfile,
          }
        : asset,
    );
    nextAssets
      .filter((asset) => selectedSet.has(asset.id))
      .forEach((asset) => persistAsset(asset));
    set({ assets: nextAssets });
  },
  updateAsset: (assetId, update) => {
    const nextAssets = get().assets.map((asset) =>
      asset.id === assetId ? { ...asset, ...update } : asset,
    );
    const updatedAsset = nextAssets.find((asset) => asset.id === assetId);
    if (updatedAsset) {
      persistAsset(updatedAsset);
    }
    set({ assets: nextAssets });
  },
  updateAssetOnly: (assetId, update) => {
    const nextAssets = get().assets.map((asset) =>
      asset.id === assetId ? { ...asset, ...update } : asset,
    );
    set({ assets: nextAssets });
  },
  setSelectedAssetIds: (assetIds) => {
    const unique = Array.from(new Set(assetIds));
    set({ selectedAssetIds: unique });
  },
  addToSelection: (assetIds) => {
    const unique = new Set(get().selectedAssetIds);
    assetIds.forEach((id) => unique.add(id));
    set({ selectedAssetIds: Array.from(unique) });
  },
  toggleAssetSelection: (assetId) => {
    const current = new Set(get().selectedAssetIds);
    if (current.has(assetId)) {
      current.delete(assetId);
    } else {
      current.add(assetId);
    }
    set({ selectedAssetIds: Array.from(current) });
  },
  removeFromSelection: (assetIds) => {
    const current = new Set(get().selectedAssetIds);
    assetIds.forEach((id) => current.delete(id));
    set({ selectedAssetIds: Array.from(current) });
  },
  clearAssetSelection: () => {
    set({ selectedAssetIds: [] });
  },
  resetProject: async () => {
    revokeAssetUrls(get().assets);
    await clearAssets();
    const project = defaultProject();
    await saveProject(project);
    set({ project, assets: [], selectedAssetIds: [] });
  },
}));
