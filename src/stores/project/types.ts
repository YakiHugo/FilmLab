import type { Asset, AssetUpdate, EditorLayer, Project } from "@/types";

export interface ImportProgress {
  current: number;
  total: number;
}

export interface ImportSkipSummary {
  unsupported: number;
  oversized: number;
  duplicated: number;
  overflow: number;
}

export interface ImportAssetsResult {
  requested: number;
  accepted: number;
  added: number;
  failed: number;
  addedAssetIds: string[];
  errors: string[];
  skipped: ImportSkipSummary;
}

// Backward-compatible alias for existing consumers during migration.
export type AddAssetsResult = ImportAssetsResult;

export interface ProjectState {
  project: Project | null;
  assets: Asset[];
  isLoading: boolean;
  isImporting: boolean;
  importProgress: ImportProgress | null;
  selectedAssetIds: string[];

  init: () => Promise<void>;
  importAssets: (files: File[] | FileList) => Promise<ImportAssetsResult>;
  applyPresetToDay: (day: string, presetId: string, intensity: number) => void;
  applyPresetToSelection: (assetIds: string[], presetId: string, intensity: number) => void;
  updateAsset: (assetId: string, update: AssetUpdate) => void;
  updateAssetOnly: (assetId: string, update: AssetUpdate) => void;
  addLayer: (assetId: string, layer: EditorLayer) => void;
  removeLayer: (assetId: string, layerId: string) => void;
  updateLayer: (assetId: string, layerId: string, patch: Partial<EditorLayer>) => void;
  moveLayer: (assetId: string, layerId: string, direction: "up" | "down") => void;
  duplicateLayer: (assetId: string, layerId: string) => void;
  mergeLayerDown: (assetId: string, layerId: string) => void;
  flattenLayers: (assetId: string) => void;

  setSelectedAssetIds: (assetIds: string[]) => void;
  clearAssetSelection: () => void;

  setAssetTags: (assetId: string, tags: string[]) => void;
  addTagsToAssets: (assetIds: string[], tags: string[]) => void;
  removeTagsFromAssets: (assetIds: string[], tags: string[]) => void;

  deleteAssets: (assetIds: string[]) => Promise<void>;
  resetProject: () => Promise<void>;
}

