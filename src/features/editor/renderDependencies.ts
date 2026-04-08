import { ensureAssetLayers } from "@/lib/editorLayers";
import type { Asset, EditorLayer } from "@/types";

const hashString = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
};

const serializeDependencyValue = (value: unknown) => {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
};

export const resolveReferencedTextureAssetIds = (layers: EditorLayer[]) => {
  const seen = new Set<string>();
  const assetIds: string[] = [];

  for (const layer of layers) {
    if (
      layer.visible === false ||
      layer.type !== "texture" ||
      !layer.textureAssetId ||
      seen.has(layer.textureAssetId)
    ) {
      continue;
    }
    seen.add(layer.textureAssetId);
    assetIds.push(layer.textureAssetId);
  }

  return assetIds;
};

const resolveReferencedAssetRenderFingerprint = (asset: Asset | undefined) => {
  if (!asset) {
    return "missing";
  }

  return hashString(
    [
      asset.id,
      asset.objectUrl,
      asset.contentHash ?? "",
      String(asset.size),
      asset.presetId ?? "",
      String(asset.intensity ?? ""),
      asset.filmProfileId ?? "",
      serializeDependencyValue(asset.filmProfile),
      serializeDependencyValue(asset.filmOverrides),
    ].join("|")
  );
};

export const buildRenderDocumentDependencyKey = (
  baseKey: string,
  assetById: Map<string, Asset>,
  layers: EditorLayer[]
) => {
  const dependencyAssetIds = resolveReferencedTextureAssetIds(layers);
  if (dependencyAssetIds.length === 0) {
    return baseKey;
  }

  const dependencyFingerprint = dependencyAssetIds
    .map((assetId) => `${assetId}:${resolveReferencedAssetRenderFingerprint(assetById.get(assetId))}`)
    .join("|");

  return `${baseKey}:deps:${hashString(dependencyFingerprint)}`;
};

export const findAssetsReferencingTextureAsset = (
  assets: Asset[],
  textureAssetId: string
) =>
  assets
    .filter((asset) =>
      ensureAssetLayers(asset).some(
        (layer) =>
          layer.visible !== false &&
          layer.type === "texture" &&
          layer.textureAssetId === textureAssetId
      )
    )
    .map((asset) => asset.id)
    .filter((assetId) => assetId !== textureAssetId);
