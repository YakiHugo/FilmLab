import type { CurrentUserState } from "./types";

export const selectAssets = (state: CurrentUserState) => state.assets;
export const selectCurrentUser = (state: CurrentUserState) => state.currentUser;
export const selectIsLoading = (state: CurrentUserState) => state.isLoading;
export const selectIsImporting = (state: CurrentUserState) => state.isImporting;
export const selectImportProgress = (state: CurrentUserState) => state.importProgress;
export const selectSelectedAssetIds = (state: CurrentUserState) => state.selectedAssetIds;

