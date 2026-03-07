interface AssetLike {
  id: string;
}

interface ResolveEditorSelectedAssetIdOptions {
  assetId?: string;
  assets: AssetLike[];
  currentSelectedAssetId: string | null;
}

export const resolveEditorSelectedAssetId = ({
  assetId,
  assets,
  currentSelectedAssetId,
}: ResolveEditorSelectedAssetIdOptions): string | null => {
  const knownAssetIds = new Set(assets.map((asset) => asset.id));

  if (typeof assetId === "string") {
    return knownAssetIds.has(assetId) ? assetId : null;
  }

  if (currentSelectedAssetId && knownAssetIds.has(currentSelectedAssetId)) {
    return currentSelectedAssetId;
  }

  return null;
};
