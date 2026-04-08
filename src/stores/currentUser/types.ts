import type { Asset, AssetOrigin, AssetUpdate, CurrentUser } from "@/types";

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

export interface ImportAssetOptions {
  source?: Asset["source"];
  origin?: AssetOrigin;
  ownerRef?: Asset["ownerRef"];
}

export interface MaterializedRemoteAssetInput {
  assetId: string;
  name: string;
  type: Asset["type"];
  size: number;
  createdAt: string;
  updatedAt: string;
  source: Asset["source"];
  origin: AssetOrigin;
  contentHash?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  objectUrl: string;
  thumbnailUrl?: string;
}

// Backward-compatible alias for existing consumers during migration.
export type AddAssetsResult = ImportAssetsResult;

export interface CurrentUserState {
  currentUser: CurrentUser | null;
  assets: Asset[];
  isLoading: boolean;
  isImporting: boolean;
  importProgress: ImportProgress | null;
  selectedAssetIds: string[];

  init: () => Promise<void>;
  importAssets: (
    files: File[] | FileList,
    options?: ImportAssetOptions
  ) => Promise<ImportAssetsResult>;
  importAssetFromUrl: (url: string) => Promise<ImportAssetsResult>;
  materializeRemoteAssets: (assets: MaterializedRemoteAssetInput[]) => void;
  runAssetSync: () => Promise<void>;
  retryAssetSyncForAsset: (assetId: string) => Promise<void>;
  updateAsset: (assetId: string, update: AssetUpdate) => void;
  updateAssetOnly: (assetId: string, update: AssetUpdate) => void;

  setSelectedAssetIds: (assetIds: string[]) => void;
  clearAssetSelection: () => void;

  setAssetTags: (assetId: string, tags: string[]) => void;
  addTagsToAssets: (assetIds: string[], tags: string[]) => void;
  removeTagsFromAssets: (assetIds: string[], tags: string[]) => void;

  deleteAssets: (assetIds: string[]) => Promise<void>;
  resetCurrentUser: () => Promise<void>;
}

