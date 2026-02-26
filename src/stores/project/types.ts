import type { Asset, AssetUpdate, Project } from "@/types";

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

  setSelectedAssetIds: (assetIds: string[]) => void;
  clearAssetSelection: () => void;

  setAssetTags: (assetId: string, tags: string[]) => void;
  addTagsToAssets: (assetIds: string[], tags: string[]) => void;
  removeTagsFromAssets: (assetIds: string[], tags: string[]) => void;

  deleteAssets: (assetIds: string[]) => Promise<void>;
  resetProject: () => Promise<void>;
}

