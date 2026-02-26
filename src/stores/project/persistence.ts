import { normalizeAdjustments } from "@/lib/adjustments";
import { saveAsset, type StoredAsset } from "@/lib/db";
import type { Asset, AssetUpdate } from "@/types";
import { mergeTags, normalizeTags } from "./tagging";

const PERSIST_DEBOUNCE_MS = 300;

const pendingPersists = new Map<
  string,
  {
    timer: ReturnType<typeof setTimeout>;
    payload: StoredAsset;
  }
>();

let isBeforeUnloadBound = false;

export const toStoredAsset = (asset: Asset): StoredAsset | null => {
  if (!asset.blob) {
    return null;
  }

  const blob =
    asset.blob instanceof File ? asset.blob.slice(0, asset.blob.size, asset.blob.type) : asset.blob;

  return {
    id: asset.id,
    name: asset.name,
    type: asset.type,
    size: asset.size,
    createdAt: asset.createdAt,
    blob,
    presetId: asset.presetId,
    intensity: asset.intensity,
    filmProfileId: asset.filmProfileId,
    filmOverrides: asset.filmOverrides,
    filmProfile: asset.filmProfile,
    group: asset.group ?? asset.importDay,
    importDay: asset.importDay,
    tags: normalizeTags(asset.tags ?? []),
    thumbnailBlob: asset.thumbnailBlob,
    metadata: asset.metadata,
    adjustments: asset.adjustments ? normalizeAdjustments(asset.adjustments) : undefined,
    aiRecommendation: asset.aiRecommendation,
  };
};

export const normalizeAssetUpdate = (update: AssetUpdate): AssetUpdate => {
  const next: AssetUpdate = { ...update };
  if (next.adjustments) {
    next.adjustments = normalizeAdjustments(next.adjustments);
  }
  if (next.tags) {
    next.tags = normalizeTags(next.tags);
  }
  return next;
};

export const persistAsset = (asset: Asset) => {
  const payload = toStoredAsset(asset);
  if (!payload) {
    return;
  }

  const existing = pendingPersists.get(asset.id);
  if (existing) {
    clearTimeout(existing.timer);
  }

  const timer = setTimeout(() => {
    pendingPersists.delete(asset.id);
    void saveAsset(payload).catch((error) => {
      console.warn("Failed to persist asset", asset.id, error);
    });
  }, PERSIST_DEBOUNCE_MS);

  pendingPersists.set(asset.id, { timer, payload });
};

export const flushPendingPersists = async () => {
  const entries = Array.from(pendingPersists.values());
  pendingPersists.clear();
  for (const { timer } of entries) {
    clearTimeout(timer);
  }
  await Promise.allSettled(entries.map(({ payload }) => saveAsset(payload)));
};

export const cancelPendingPersist = (assetId: string) => {
  const pending = pendingPersists.get(assetId);
  if (!pending) {
    return;
  }
  clearTimeout(pending.timer);
  pendingPersists.delete(assetId);
};

export const cancelPendingPersists = (assetIds: Iterable<string>) => {
  for (const id of assetIds) {
    cancelPendingPersist(id);
  }
};

export const ensurePersistFlushOnUnload = () => {
  if (typeof window === "undefined" || isBeforeUnloadBound) {
    return;
  }

  window.addEventListener("beforeunload", () => {
    for (const { timer, payload } of pendingPersists.values()) {
      clearTimeout(timer);
      void saveAsset(payload).catch(() => {});
    }
    pendingPersists.clear();
  });

  isBeforeUnloadBound = true;
};

export const mergeAssetTags = (asset: Asset, tags: string[]) => ({
  ...asset,
  tags: mergeTags(asset.tags, tags),
});

