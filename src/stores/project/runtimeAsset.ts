import { createDefaultAdjustments, normalizeAdjustments } from "@/lib/adjustments";
import type { StoredAsset } from "@/lib/db";
import { ensureAssetLayers, resolveBaseAdjustmentsFromLayers } from "@/lib/editorLayers";
import type { Asset, AssetOwnerRef } from "@/types";
import { resolveAssetImportDay } from "./grouping";
import { normalizeTags } from "./tagging";

interface MaterializeStoredAssetOptions {
  fallbackOwnerRef: AssetOwnerRef;
  nowIso?: string;
}

const isBlobValue = (value: unknown): value is Blob =>
  typeof Blob !== "undefined" && value instanceof Blob;

export const materializeStoredAsset = (
  stored: StoredAsset,
  options: MaterializeStoredAssetOptions
): Asset | null => {
  if (!isBlobValue(stored.blob)) {
    console.warn(`Skipping stored asset ${stored.id} because its source blob is missing or invalid.`);
    return null;
  }

  const objectUrl = URL.createObjectURL(stored.blob);
  let thumbnailUrl = objectUrl;

  try {
    const thumbnailBlob = isBlobValue(stored.thumbnailBlob) ? stored.thumbnailBlob : undefined;
    if (thumbnailBlob) {
      thumbnailUrl = URL.createObjectURL(thumbnailBlob);
    }

    const importDay = resolveAssetImportDay(stored);
    const tags = normalizeTags(stored.tags ?? []);
    const normalizedAdjustments = normalizeAdjustments(
      stored.adjustments ?? createDefaultAdjustments()
    );
    const normalizedLayers = ensureAssetLayers({
      id: stored.id,
      adjustments: normalizedAdjustments,
      layers: stored.layers,
    });
    const nowIso = options.nowIso ?? new Date().toISOString();

    return {
      id: stored.id,
      name: stored.name,
      type: stored.type,
      size: stored.size,
      createdAt: stored.createdAt,
      objectUrl,
      thumbnailUrl,
      importDay,
      tags,
      presetId: stored.presetId,
      intensity: stored.intensity,
      filmProfileId: stored.filmProfileId,
      filmOverrides: stored.filmOverrides,
      filmProfile: stored.filmProfile,
      group: stored.group ?? importDay,
      blob: stored.blob,
      thumbnailBlob,
      metadata: stored.metadata,
      adjustments: resolveBaseAdjustmentsFromLayers(normalizedLayers, normalizedAdjustments),
      layers: normalizedLayers,
      aiRecommendation: stored.aiRecommendation,
      source: stored.source,
      origin: stored.origin ?? "file",
      contentHash: stored.contentHash,
      remote:
        stored.remote ??
        ({
          status: "local_only",
          updatedAt: nowIso,
        } as const),
      ownerRef: stored.ownerRef ?? options.fallbackOwnerRef,
    };
  } catch (error) {
    if (thumbnailUrl !== objectUrl) {
      URL.revokeObjectURL(thumbnailUrl);
    }
    URL.revokeObjectURL(objectUrl);
    console.warn(`Skipping stored asset ${stored.id} because it could not be materialized.`, error);
    return null;
  }
};
