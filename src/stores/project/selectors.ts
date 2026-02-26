import type { ProjectState } from "./types";

export const selectAssets = (state: ProjectState) => state.assets;
export const selectProject = (state: ProjectState) => state.project;
export const selectIsLoading = (state: ProjectState) => state.isLoading;
export const selectIsImporting = (state: ProjectState) => state.isImporting;
export const selectImportProgress = (state: ProjectState) => state.importProgress;
export const selectSelectedAssetIds = (state: ProjectState) => state.selectedAssetIds;

