import pLimit from "p-limit";
import { presets } from "@/data/presets";
import { createDefaultAdjustments } from "@/lib/adjustments";
import { prepareAssetPayload } from "@/lib/assetMetadata";
import { saveAsset } from "@/lib/db";
import type { Asset } from "@/types";
import {
  IMPORT_PROGRESS_THROTTLE_MS,
  MAX_IMPORT_BATCH_SIZE,
  MAX_IMPORT_FILE_SIZE,
  isSupportedImportFile,
  resolveImportConcurrency,
} from "./constants";
import { toLocalDayKey } from "./grouping";
import { toStoredAsset } from "./persistence";
import type { ImportAssetsResult, ImportProgress } from "./types";

interface ImportPipelineOptions {
  files: File[];
  existingAssets: Asset[];
  onProgress?: (progress: ImportProgress) => void;
  onAssetImported?: (asset: Asset) => void;
}

const getFingerprint = (input: { name: string; size: number }) => `${input.name}:${input.size}`;

const createAssetId = (file: File) => {
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(16).slice(2);
  return `${file.name}-${file.lastModified}-${random}`;
};

const createEmptyResult = (requested = 0): ImportAssetsResult => ({
  requested,
  accepted: 0,
  added: 0,
  failed: 0,
  addedAssetIds: [],
  errors: [],
  skipped: {
    unsupported: 0,
    oversized: 0,
    duplicated: 0,
    overflow: 0,
  },
});

export const runImportPipeline = async ({
  files,
  existingAssets,
  onProgress,
  onAssetImported,
}: ImportPipelineOptions): Promise<ImportAssetsResult> => {
  const requested = files.length;
  if (requested === 0) {
    return createEmptyResult(0);
  }

  const skipped = {
    unsupported: 0,
    oversized: 0,
    duplicated: 0,
    overflow: 0,
  };

  const supported: File[] = [];
  for (const file of files) {
    if (!isSupportedImportFile(file)) {
      skipped.unsupported += 1;
      continue;
    }
    supported.push(file);
  }

  const withinSize: File[] = [];
  for (const file of supported) {
    if (file.size > MAX_IMPORT_FILE_SIZE) {
      skipped.oversized += 1;
      continue;
    }
    withinSize.push(file);
  }

  const existingFingerprints = new Set(existingAssets.map(getFingerprint));
  const seenInBatch = new Set<string>();
  const deduped: File[] = [];

  for (const file of withinSize) {
    const fingerprint = getFingerprint(file);
    if (existingFingerprints.has(fingerprint) || seenInBatch.has(fingerprint)) {
      skipped.duplicated += 1;
      continue;
    }
    seenInBatch.add(fingerprint);
    deduped.push(file);
  }

  if (deduped.length > MAX_IMPORT_BATCH_SIZE) {
    skipped.overflow = deduped.length - MAX_IMPORT_BATCH_SIZE;
  }
  const acceptedFiles = deduped.slice(0, MAX_IMPORT_BATCH_SIZE);

  const initial: ImportAssetsResult = {
    ...createEmptyResult(requested),
    accepted: acceptedFiles.length,
    skipped,
  };

  if (acceptedFiles.length === 0) {
    return initial;
  }

  const total = acceptedFiles.length;
  let processed = 0;
  let lastProgressTs = 0;

  const emitProgress = (force = false) => {
    if (!onProgress) {
      return;
    }
    const now = Date.now();
    if (!force && now - lastProgressTs < IMPORT_PROGRESS_THROTTLE_MS) {
      return;
    }
    lastProgressTs = now;
    onProgress({ current: processed, total });
  };

  onProgress?.({ current: 0, total });

  const timestamp = new Date().toISOString();
  const importDay = toLocalDayKey(timestamp);
  const defaultPreset = presets[0];

  const limit = pLimit(resolveImportConcurrency());
  const addedAssetIds: string[] = [];
  const errors: string[] = [];
  let added = 0;
  let failed = 0;

  await Promise.all(
    acceptedFiles.map((file) =>
      limit(async () => {
        let objectUrl: string | undefined;
        let thumbnailUrl: string | undefined;

        try {
          const id = createAssetId(file);
          const fileBlob = file.slice(0, file.size, file.type);
          const { metadata, thumbnailBlob } = await prepareAssetPayload(fileBlob);

          objectUrl = URL.createObjectURL(fileBlob);
          thumbnailUrl = thumbnailBlob ? URL.createObjectURL(thumbnailBlob) : objectUrl;

          const asset: Asset = {
            id,
            name: file.name,
            type: file.type,
            size: file.size,
            createdAt: timestamp,
            objectUrl,
            thumbnailUrl,
            importDay,
            group: importDay,
            tags: [],
            presetId: defaultPreset?.id,
            intensity: defaultPreset?.intensity,
            filmProfileId: defaultPreset?.filmProfileId,
            filmProfile: defaultPreset?.filmProfile,
            blob: fileBlob,
            thumbnailBlob,
            metadata,
            adjustments: createDefaultAdjustments(),
            source: "imported",
          };

          const payload = toStoredAsset(asset);
          const persisted = payload ? await saveAsset(payload) : false;
          if (!persisted) {
            throw new Error("Failed to persist imported asset");
          }

          added += 1;
          addedAssetIds.push(id);
          onAssetImported?.(asset);
        } catch (error) {
          if (objectUrl) {
            URL.revokeObjectURL(objectUrl);
          }
          if (thumbnailUrl && thumbnailUrl !== objectUrl) {
            URL.revokeObjectURL(thumbnailUrl);
          }

          failed += 1;
          const detail = error instanceof Error ? error.message : "Unknown error";
          errors.push(`${file.name}: ${detail}`);
        } finally {
          processed += 1;
          emitProgress(false);
        }
      })
    )
  );

  emitProgress(true);

  return {
    requested,
    accepted: acceptedFiles.length,
    added,
    failed,
    addedAssetIds,
    errors,
    skipped,
  };
};

