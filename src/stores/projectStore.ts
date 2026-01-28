import { create } from "zustand";
import { presets } from "@/data/presets";
import { createDefaultAdjustments } from "@/lib/adjustments";
import { prepareAssetPayload } from "@/lib/assetMetadata";
import type { Asset, Project } from "@/types";
import { loadAssets, loadProject, saveAsset, saveProject, clearAssets } from "@/lib/db";

interface ProjectState {
  project: Project | null;
  assets: Asset[];
  presets: typeof presets;
  isLoading: boolean;
  selectedAssetIds: string[];
  init: () => Promise<void>;
  addAssets: (files: File[]) => Promise<void>;
  applyPresetToGroup: (group: string, presetId: string, intensity: number) => void;
  updatePresetForGroup: (group: string, presetId: string) => void;
  updateIntensityForGroup: (group: string, intensity: number) => void;
  applyPresetToSelection: (
    assetIds: string[],
    presetId: string,
    intensity: number
  ) => void;
  updateAsset: (assetId: string, update: Partial<Asset>) => void;
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
    name: "胶片工作流演示项目",
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

export const useProjectStore = create<ProjectState>((set, get) => ({
  project: null,
  assets: [],
  presets,
  isLoading: true,
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
        group: asset.group ?? `分组 ${index % 4 + 1}`,
        blob: asset.blob,
        thumbnailBlob: asset.thumbnailBlob,
        metadata: asset.metadata,
        adjustments: asset.adjustments ?? createDefaultAdjustments(),
      };
    });
    const nextSelection = get().selectedAssetIds.filter((id) =>
      assets.some((asset) => asset.id === id)
    );
    revokeAssetUrls(get().assets);
    set({ project, assets, isLoading: false, selectedAssetIds: nextSelection });
  },
  addAssets: async (files: File[]) => {
    const { assets, project } = get();
    const timestamp = new Date().toISOString();
    const newAssets: Asset[] = [];
    for (const file of files) {
      const id = `${file.name}-${file.lastModified}-${Math.random().toString(16).slice(2)}`;
      const group = `分组 ${newAssets.length % 4 + 1}`;
      const { metadata, thumbnailBlob } = await prepareAssetPayload(file);
      const objectUrl = URL.createObjectURL(file);
      const thumbnailUrl = thumbnailBlob ? URL.createObjectURL(thumbnailBlob) : objectUrl;
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
        group,
        blob: file,
        thumbnailBlob,
        metadata,
        adjustments: createDefaultAdjustments(),
      };
      await saveAsset({
        id,
        name: file.name,
        type: file.type,
        size: file.size,
        createdAt: timestamp,
        blob: file,
        presetId: asset.presetId,
        intensity: asset.intensity,
        group,
        thumbnailBlob,
        metadata,
        adjustments: asset.adjustments,
      });
      newAssets.push(asset);
    }
    const updatedProject = project ? { ...project, updatedAt: timestamp } : defaultProject();
    await saveProject(updatedProject);
    set({ project: updatedProject, assets: [...assets, ...newAssets] });
  },
  applyPresetToGroup: (group, presetId, intensity) => {
    const nextAssets = get().assets.map((asset) =>
      asset.group === group ? { ...asset, presetId, intensity } : asset
    );
    nextAssets.forEach((asset) => {
      if (asset.blob && asset.group === group) {
        void saveAsset({
          id: asset.id,
          name: asset.name,
          type: asset.type,
          size: asset.size,
          createdAt: asset.createdAt,
          blob: asset.blob,
          presetId: asset.presetId,
          intensity: asset.intensity,
          group: asset.group,
          thumbnailBlob: asset.thumbnailBlob,
          metadata: asset.metadata,
          adjustments: asset.adjustments,
        });
      }
    });
    set({ assets: nextAssets });
  },
  updatePresetForGroup: (group, presetId) => {
    const nextAssets = get().assets.map((asset) =>
      asset.group === group ? { ...asset, presetId } : asset
    );
    nextAssets.forEach((asset) => {
      if (asset.blob && asset.group === group) {
        void saveAsset({
          id: asset.id,
          name: asset.name,
          type: asset.type,
          size: asset.size,
          createdAt: asset.createdAt,
          blob: asset.blob,
          presetId: asset.presetId,
          intensity: asset.intensity,
          group: asset.group,
          thumbnailBlob: asset.thumbnailBlob,
          metadata: asset.metadata,
          adjustments: asset.adjustments,
        });
      }
    });
    set({ assets: nextAssets });
  },
  updateIntensityForGroup: (group, intensity) => {
    const nextAssets = get().assets.map((asset) =>
      asset.group === group ? { ...asset, intensity } : asset
    );
    nextAssets.forEach((asset) => {
      if (asset.blob && asset.group === group) {
        void saveAsset({
          id: asset.id,
          name: asset.name,
          type: asset.type,
          size: asset.size,
          createdAt: asset.createdAt,
          blob: asset.blob,
          presetId: asset.presetId,
          intensity: asset.intensity,
          group: asset.group,
          thumbnailBlob: asset.thumbnailBlob,
          metadata: asset.metadata,
          adjustments: asset.adjustments,
        });
      }
    });
    set({ assets: nextAssets });
  },
  applyPresetToSelection: (assetIds, presetId, intensity) => {
    const selectedSet = new Set(assetIds);
    const nextAssets = get().assets.map((asset) =>
      selectedSet.has(asset.id) ? { ...asset, presetId, intensity } : asset
    );
    nextAssets.forEach((asset) => {
      if (asset.blob && selectedSet.has(asset.id)) {
        void saveAsset({
          id: asset.id,
          name: asset.name,
          type: asset.type,
          size: asset.size,
          createdAt: asset.createdAt,
          blob: asset.blob,
          presetId: asset.presetId,
          intensity: asset.intensity,
          group: asset.group,
          thumbnailBlob: asset.thumbnailBlob,
          metadata: asset.metadata,
          adjustments: asset.adjustments,
        });
      }
    });
    set({ assets: nextAssets });
  },
  updateAsset: (assetId, update) => {
    const nextAssets = get().assets.map((asset) =>
      asset.id === assetId ? { ...asset, ...update } : asset
    );
    const updatedAsset = nextAssets.find((asset) => asset.id === assetId);
    if (updatedAsset?.blob) {
      void saveAsset({
        id: updatedAsset.id,
        name: updatedAsset.name,
        type: updatedAsset.type,
        size: updatedAsset.size,
        createdAt: updatedAsset.createdAt,
        blob: updatedAsset.blob,
        presetId: updatedAsset.presetId,
        intensity: updatedAsset.intensity,
        group: updatedAsset.group,
        thumbnailBlob: updatedAsset.thumbnailBlob,
        metadata: updatedAsset.metadata,
        adjustments: updatedAsset.adjustments,
      });
    }
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
