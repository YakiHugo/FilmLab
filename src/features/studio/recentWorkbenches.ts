import type { Asset, CanvasWorkbenchListEntry } from "@/types";

const timestampOrZero = (value: string) => {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
};

export const resolveRecentWorkbenchCards = ({
  assets,
  limit = 4,
  workbenches,
}: {
  assets: Asset[];
  limit?: number;
  workbenches: CanvasWorkbenchListEntry[];
}) => {
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));

  return workbenches
    .slice()
    .sort(
      (left, right) =>
        timestampOrZero(right.updatedAt) - timestampOrZero(left.updatedAt) ||
        right.id.localeCompare(left.id)
    )
    .slice(0, Math.max(0, limit))
    .map((workbench) => ({
      workbench,
      coverAsset: workbench.coverAssetId ? (assetById.get(workbench.coverAssetId) ?? null) : null,
    }));
};
