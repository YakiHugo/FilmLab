import { create } from "zustand";
import { presets } from "@/data/presets";
import { createDefaultAdjustments, normalizeAdjustments } from "@/lib/adjustments";
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
  errors?: string[];
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
    name: "FilmLab 项目",
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
  const blob =
    asset.blob instanceof File
      ? asset.blob.slice(0, asset.blob.size, asset.blob.type)
      : asset.blob;

  return {
    id: asset.id,
    name: asset.name,
    type: asset.type,
    size: asset.size,
    createdAt: asset.createdAt,
    blob,
    presetId: asset.presetId,
    intensity: asset.intensity,
    filmProfileId: asset.filmProfileId,
    filmOverrides: asset.filmOverrides,
    filmProfile: asset.filmProfile,
    group: asset.group,
    thumbnailBlob: asset.thumbnailBlob,
    metadata: asset.metadata,
    adjustments: asset.adjustments
      ? normalizeAdjustments(asset.adjustments)
      : undefined,
    aiRecommendation: asset.aiRecommendation,
  };
};

const normalizeAssetUpdate = (update: Partial<Asset>): Partial<Asset> => {
  if (!update.adjustments) {
    return update;
  }
  return {
    ...update,
    adjustments: normalizeAdjustments(update.adjustments),
  };
};

const PERSIST_DEBOUNCE_MS = 300;
const pendingPersists = new Map<string, ReturnType<typeof setTimeout>>();

const persistAsset = (asset: Asset) => {
  const payload = toStoredAsset(asset);
  if (!payload) {
    return;
  }

  // Cancel any pending write for this asset so only the latest state is persisted
  const existing = pendingPersists.get(asset.id);
  if (existing) {
    clearTimeout(existing);
  }

  const timer = setTimeout(() => {
    pendingPersists.delete(asset.id);
    void saveAsset(payload).catch((error) => {
      console.warn("Failed to persist asset", asset.id, error);
    });
  }, PERSIST_DEBOUNCE_MS);

  pendingPersists.set(asset.id, timer);
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
        adjustments: normalizeAdjustments(asset.adjustments ?? createDefaultAdjustments()),
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
      const errors: string[] = [];

      for (const file of files) {
        try {
          const id = `${file.name}-${file.lastModified}-${Math.random().toString(16).slice(2)}`;
          const group = `Group ${((assets.length + newAssets.length) % 4) + 1}`;
          const fileBlob = file.slice(0, file.size, file.type);
          const { metadata, thumbnailBlob } = await prepareAssetPayload(fileBlob);
          const objectUrl = URL.createObjectURL(fileBlob);
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
            blob: fileBlob,
            thumbnailBlob,
            metadata,
            adjustments: createDefaultAdjustments(),
          };

          const payload = toStoredAsset(asset);
          if (payload) {
            await saveAsset(payload);
          }
          newAssets.push(asset);
        } catch (error) {
          console.warn("Failed to import asset", file.name, error);
          failedCount += 1;
          const detail = error instanceof Error ? error.message : "Unknown error";
          errors.push(`${file.name}: ${detail}`);
        }
      }
      if (newAssets.length === 0) {
        return {
          added: 0,
          failed: failedCount || files.length,
          addedAssetIds: [],
          errors,
        };
      }

      const updatedProject = project
        ? { ...project, updatedAt: timestamp }
        : defaultProject();
      try {
        await saveProject(updatedProject);
      } catch (error) {
        console.warn("Failed to persist project after import", error);
      }
      set({
        project: updatedProject,
        assets: [...assets, ...newAssets],
      });
      return {
        added: newAssets.length,
        failed: failedCount,
        addedAssetIds: newAssets.map((asset) => asset.id),
        errors,
      };
    } finally {
      set({ isImporting: false });
    }
  },
  applyPresetToGroup: (group, presetId, intensity) => {
    const selectedPreset = presets.find((preset) => preset.id === presetId);
    const changed: Asset[] = [];
    const nextAssets = get().assets.map((asset) => {
      if (asset.group !== group) return asset;
      const updated = {
        ...asset,
        presetId,
        intensity,
        filmProfileId: selectedPreset?.filmProfileId,
        filmOverrides: undefined,
        filmProfile: selectedPreset?.filmProfile,
      };
      changed.push(updated);
      return updated;
    });
    changed.forEach(persistAsset);
    set({ assets: nextAssets });
  },
  updatePresetForGroup: (group, presetId) => {
    const selectedPreset = presets.find((preset) => preset.id === presetId);
    const changed: Asset[] = [];
    const nextAssets = get().assets.map((asset) => {
      if (asset.group !== group) return asset;
      const updated = {
        ...asset,
        presetId,
        filmProfileId: selectedPreset?.filmProfileId,
        filmOverrides: undefined,
        filmProfile: selectedPreset?.filmProfile,
      };
      changed.push(updated);
      return updated;
    });
    changed.forEach(persistAsset);
    set({ assets: nextAssets });
  },
  updateIntensityForGroup: (group, intensity) => {
    const changed: Asset[] = [];
    const nextAssets = get().assets.map((asset) => {
      if (asset.group !== group) return asset;
      const updated = { ...asset, intensity };
      changed.push(updated);
      return updated;
    });
    changed.forEach(persistAsset);
    set({ assets: nextAssets });
  },
  applyPresetToSelection: (assetIds, presetId, intensity) => {
    const selectedSet = new Set(assetIds);
    const selectedPreset = presets.find((preset) => preset.id === presetId);
    const changed: Asset[] = [];
    const nextAssets = get().assets.map((asset) => {
      if (!selectedSet.has(asset.id)) return asset;
      const updated = {
        ...asset,
        presetId,
        intensity,
        filmProfileId: selectedPreset?.filmProfileId,
        filmOverrides: undefined,
        filmProfile: selectedPreset?.filmProfile,
      };
      changed.push(updated);
      return updated;
    });
    changed.forEach(persistAsset);
    set({ assets: nextAssets });
  },
  updateAsset: (assetId, update) => {
    const normalizedUpdate = normalizeAssetUpdate(update);
    const nextAssets = get().assets.map((asset) =>
      asset.id === assetId ? { ...asset, ...normalizedUpdate } : asset,
    );
    const updatedAsset = nextAssets.find((asset) => asset.id === assetId);
    if (updatedAsset) {
      persistAsset(updatedAsset);
    }
    set({ assets: nextAssets });
  },
  updateAssetOnly: (assetId, update) => {
    const normalizedUpdate = normalizeAssetUpdate(update);
    const nextAssets = get().assets.map((asset) =>
      asset.id === assetId ? { ...asset, ...normalizedUpdate } : asset,
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

    // Clear orphaned editor history for all assets
    const { useEditorStore } = await import("@/stores/editorStore");
    useEditorStore.getState().clearAllHistory();
  },
}));
