import { create } from "zustand";
import { devtools } from "zustand/middleware";
import pLimit from "p-limit";
import { presets } from "@/data/presets";
import { createDefaultAdjustments, normalizeAdjustments } from "@/lib/adjustments";
import {
  completeAssetUpload,
  fetchAssetChanges,
  deleteRemoteAsset,
  prepareAssetUpload,
  uploadToAssetTarget,
} from "@/lib/assetSyncApi";
import { getCurrentUserId } from "@/lib/authToken";
import { sha256FromBlob } from "@/lib/hash";
import {
  cloneEditorLayers,
  ensureAssetLayers,
  moveLayerByDirection,
  resolveBaseAdjustmentsFromLayers,
} from "@/lib/editorLayers";
import { createId } from "@/utils";
import {
  clearAssetSyncJobsByUser,
  clearAssetsByUser,
  clearCanvasWorkbenchesByUser,
  deleteAsset,
  deleteAssetSyncJob,
  deleteAssetSyncJobsByAssetId,
  loadAssetSyncJobsByUser,
  loadAssetsByUser,
  loadCurrentUser,
  saveAssetSyncJob,
  saveAssetSyncJobs,
  saveAsset,
  saveCurrentUser,
  type StoredAsset,
} from "@/lib/db";
import { createRenderedThumbnailBlob } from "@/features/editor/thumbnail";
import {
  createEditorAssetSnapshot,
  isEditorAssetSnapshotEqual,
} from "@/features/editor/history";
import {
  describeRenderMaterializationUnsupportedReason,
  executeRenderMaterialization,
  isRenderMaterializationPlanCurrent,
  resolveRenderMaterialization,
  type RenderMaterializationIntent,
} from "@/features/editor/renderMaterialization";
import { findAssetsReferencingTextureAsset } from "@/features/editor/renderDependencies";
import { emit } from "@/lib/storeEvents";
import { loadCustomPresets } from "@/features/editor/presetUtils";
import type { Asset, AssetRemoteSyncStatus, EditorLayer } from "@/types";
import { IMPORT_COMMIT_CHUNK_SIZE } from "./currentUser/constants";
import { resolveAssetImportDay, toLocalDayKey } from "./currentUser/grouping";
import { runImportPipeline } from "./currentUser/importPipeline";
import {
  cancelPendingPersists,
  ensurePersistFlushOnUnload,
  flushPendingPersists,
  normalizeAssetUpdate,
  persistAsset,
  toStoredAsset,
} from "./currentUser/persistence";
import { materializeStoredAsset } from "./currentUser/runtimeAsset";
import { MAX_SYNC_ATTEMPTS, createSyncJob, isSyncJobReady, withSyncJobFailure } from "./currentUser/sync";
import { selectAssets, selectImportProgress, selectIsImporting, selectIsLoading, selectCurrentUser, selectSelectedAssetIds } from "./currentUser/selectors";
import { mergeTags, normalizeTags, removeTags } from "./currentUser/tagging";
import type {
  AddAssetsResult,
  CurrentUserState,
  MaterializedRemoteAssetInput,
} from "./currentUser/types";

const findPresetById = (presetId: string) => {
  const builtIn = presets.find((preset) => preset.id === presetId);
  if (builtIn) {
    return builtIn;
  }
  const custom = loadCustomPresets();
  return custom.find((preset) => preset.id === presetId);
};

const applyPresetToAssets = (
  assets: Asset[],
  shouldUpdate: (asset: Asset) => boolean,
  presetId: string,
  intensity?: number
): { nextAssets: Asset[]; changed: Asset[] } => {
  const selectedPreset = findPresetById(presetId);
  const changed: Asset[] = [];

  const nextAssets = assets.map((asset) => {
    if (!shouldUpdate(asset)) {
      return asset;
    }

    const updated: Asset = {
      ...asset,
      presetId,
      ...(intensity !== undefined ? { intensity } : {}),
      filmProfileId: selectedPreset?.filmProfileId,
      filmOverrides: undefined,
      filmProfile: selectedPreset?.filmProfile,
    };

    changed.push(updated);
    return updated;
  });

  return { nextAssets, changed };
};

const defaultCurrentUser = () => {
  const userId = getCurrentUserId();
  const now = new Date().toISOString();
  return {
    id: userId,
    name: userId,
    createdAt: now,
    updatedAt: now,
  };
};

const revokeAssetUrls = (assets: Asset[]) => {
  assets.forEach((asset) => {
    if (asset.objectUrl) {
      URL.revokeObjectURL(asset.objectUrl);
    }
    if (asset.thumbnailUrl && asset.thumbnailUrl !== asset.objectUrl) {
      URL.revokeObjectURL(asset.thumbnailUrl);
    }
  });
};

const withLayerMutation = (
  asset: Asset,
  mutate: (layers: EditorLayer[]) => EditorLayer[]
): Asset => {
  const currentLayers = ensureAssetLayers(asset);
  const nextLayers = mutate(cloneEditorLayers(currentLayers));
  const normalizedLayers = ensureAssetLayers({
    id: asset.id,
    adjustments: asset.adjustments,
    layers: nextLayers,
  });
  const nextAdjustments = resolveBaseAdjustmentsFromLayers(normalizedLayers, asset.adjustments);
  return {
    ...asset,
    adjustments: nextAdjustments,
    layers: normalizedLayers,
  };
};

const applyNormalizedAssetUpdate = (asset: Asset, update: ReturnType<typeof normalizeAssetUpdate>) => {
  const merged: Asset = {
    ...asset,
    ...update,
  };

  if (update.adjustments && !update.layers) {
    const layersWithUpdatedBase = withLayerMutation(merged, (layers) =>
      layers.map((layer) =>
        layer.type === "base"
          ? {
              ...layer,
              adjustments: normalizeAdjustments(update.adjustments),
            }
          : layer
      )
    );
    return layersWithUpdatedBase;
  }

  const normalizedLayers = ensureAssetLayers(merged);
  return {
    ...merged,
    layers: normalizedLayers,
    adjustments: resolveBaseAdjustmentsFromLayers(normalizedLayers, merged.adjustments),
  };
};

const createEmptyImportResult = (): AddAssetsResult => ({
  requested: 0,
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

const syncNowIso = () => new Date().toISOString();
let isSyncRunning = false;
let assetStoreEpoch = 0;
let lastRemoteChangeCursor: string | undefined;
let pendingAssetInitPromise: Promise<void> | null = null;
const THUMBNAIL_REFRESH_DEBOUNCE_MS = 220;
const pendingThumbnailRefreshTimers = new Map<string, ReturnType<typeof setTimeout>>();
const thumbnailRefreshVersions = new Map<string, number>();

const shouldRefreshRenderedThumbnail = (
  update: ReturnType<typeof normalizeAssetUpdate>
) =>
  Boolean(
    update.adjustments ||
      update.layers ||
      update.filmProfile ||
      update.filmOverrides ||
      update.filmProfileId !== undefined ||
      update.presetId !== undefined ||
      update.intensity !== undefined
  );

const shouldRefreshReferencedRenderedThumbnails = (
  update: ReturnType<typeof normalizeAssetUpdate>
) =>
  Boolean(
    update.filmProfile ||
      update.filmOverrides ||
      update.filmProfileId !== undefined ||
      update.presetId !== undefined ||
      update.intensity !== undefined ||
      update.contentHash !== undefined
  );

const scheduleRenderedThumbnailRefresh = (
  assetId: string,
  set: (updater: (state: CurrentUserState) => Partial<CurrentUserState>) => void,
  get: () => CurrentUserState
) => {
  const pending = pendingThumbnailRefreshTimers.get(assetId);
  if (pending) {
    clearTimeout(pending);
  }
  const version = (thumbnailRefreshVersions.get(assetId) ?? 0) + 1;
  thumbnailRefreshVersions.set(assetId, version);

  pendingThumbnailRefreshTimers.set(
    assetId,
    setTimeout(() => {
      pendingThumbnailRefreshTimers.delete(assetId);
      void (async () => {
        const currentState = get();
        const currentAsset = currentState.assets.find((asset) => asset.id === assetId);
        if (!currentAsset?.blob) {
          return;
        }

        const thumbnailBlob = await createRenderedThumbnailBlob(
          currentAsset,
          currentState.assets
        );
        if (!thumbnailBlob || thumbnailRefreshVersions.get(assetId) !== version) {
          return;
        }

        let previousThumbnailUrl: string | null = null;
        let persistedAsset: Asset | null = null;
        const nextThumbnailUrl = URL.createObjectURL(thumbnailBlob);

        set((state) => ({
          assets: state.assets.map((asset) => {
            if (asset.id !== assetId) {
              return asset;
            }
            previousThumbnailUrl =
              asset.thumbnailUrl && asset.thumbnailUrl !== asset.objectUrl
                ? asset.thumbnailUrl
                : null;
            persistedAsset = {
              ...asset,
              thumbnailBlob,
              thumbnailUrl: nextThumbnailUrl,
            };
            return persistedAsset;
          }),
        }));

        if (previousThumbnailUrl) {
          URL.revokeObjectURL(previousThumbnailUrl);
        }
        if (persistedAsset) {
          persistAsset(persistedAsset);
        }
      })().catch((error) => {
        console.warn("Failed to refresh rendered thumbnail", assetId, error);
      });
    }, THUMBNAIL_REFRESH_DEBOUNCE_MS)
  );
};

const scheduleReferencedThumbnailRefreshes = (
  assetId: string,
  set: (updater: (state: CurrentUserState) => Partial<CurrentUserState>) => void,
  get: () => CurrentUserState
) => {
  const dependentAssetIds = findAssetsReferencingTextureAsset(get().assets, assetId);
  dependentAssetIds.forEach((dependentAssetId) => {
    scheduleRenderedThumbnailRefresh(dependentAssetId, set, get);
  });
};

const withRemoteStatus = (
  asset: Asset,
  status: AssetRemoteSyncStatus,
  patch?: Partial<NonNullable<Asset["remote"]>>
): Asset => ({
  ...asset,
  remote: {
    ...asset.remote,
    ...(patch ?? {}),
    status,
    updatedAt: syncNowIso(),
  },
});

const latestIso = (left?: string, right?: string): string | undefined => {
  if (!left) return right;
  if (!right) return left;
  return Date.parse(left) >= Date.parse(right) ? left : right;
};

const isRemotelyPersisted = (asset: Asset) =>
  Boolean(asset.remote?.lastSyncedAt) ||
  asset.remote?.status === "synced" ||
  asset.remote?.status === "delete_queued" ||
  asset.remote?.status === "deleting" ||
  asset.remote?.status === "delete_failed";

const toAssetMetadata = (metadata?: Record<string, unknown>): Asset["metadata"] | undefined => {
  if (!metadata || typeof metadata !== "object") {
    return undefined;
  }

  const next: NonNullable<Asset["metadata"]> = {};
  if (typeof metadata.width === "number") next.width = metadata.width;
  if (typeof metadata.height === "number") next.height = metadata.height;
  if (typeof metadata.cameraMake === "string") next.cameraMake = metadata.cameraMake;
  if (typeof metadata.cameraModel === "string") next.cameraModel = metadata.cameraModel;
  if (typeof metadata.lensModel === "string") next.lensModel = metadata.lensModel;
  if (typeof metadata.focalLength === "number") next.focalLength = metadata.focalLength;
  if (typeof metadata.aperture === "number") next.aperture = metadata.aperture;
  if (typeof metadata.shutterSpeed === "string") next.shutterSpeed = metadata.shutterSpeed;
  if (typeof metadata.iso === "number") next.iso = metadata.iso;
  if (typeof metadata.capturedAt === "string") next.capturedAt = metadata.capturedAt;
  return Object.keys(next).length > 0 ? next : undefined;
};

const mergeRemoteAsset = (
  current: Asset | undefined,
  input: MaterializedRemoteAssetInput
): Asset => {
  const importDay = current?.importDay ?? toLocalDayKey(input.createdAt);
  const metadata = toAssetMetadata(input.metadata);
  const remote = {
    ...(current?.remote ?? {}),
    status: "synced" as const,
    lastError: undefined,
    updatedAt: input.updatedAt,
    lastSyncedAt: input.updatedAt,
  };

  return {
    ...current,
    id: input.assetId,
    name: input.name,
    type: input.type,
    size: input.size,
    createdAt: input.createdAt,
    objectUrl: current?.blob ? current.objectUrl : input.objectUrl,
    thumbnailUrl: current?.blob
      ? (current.thumbnailUrl ?? current.objectUrl)
      : (input.thumbnailUrl ?? input.objectUrl),
    importDay,
    group: current?.group ?? importDay,
    tags: current?.tags ?? normalizeTags(input.tags ?? []),
    metadata: metadata ?? current?.metadata,
    source: input.source ?? current?.source,
    origin: input.origin ?? current?.origin ?? "file",
    contentHash: input.contentHash ?? current?.contentHash,
    remote,
    ownerRef: current?.ownerRef ?? { userId: getCurrentUserId() },
  };
};

const toMetadataRecord = (asset: Asset): Record<string, unknown> | undefined => {
  if (!asset.metadata) {
    return undefined;
  }
  return {
    width: asset.metadata.width,
    height: asset.metadata.height,
    cameraMake: asset.metadata.cameraMake,
    cameraModel: asset.metadata.cameraModel,
    lensModel: asset.metadata.lensModel,
    focalLength: asset.metadata.focalLength,
    aperture: asset.metadata.aperture,
    shutterSpeed: asset.metadata.shutterSpeed,
    iso: asset.metadata.iso,
    capturedAt: asset.metadata.capturedAt,
  };
};

const toQueuedUploadAsset = (asset: Asset) =>
  withRemoteStatus(asset, "upload_queued", {
    lastError: undefined,
  });

const enqueueUploadJobs = (assets: Asset[]) => {
  if (assets.length === 0) {
    return;
  }
  const queuedAt = syncNowIso();
  void saveAssetSyncJobs(
    assets.map((asset) =>
      createSyncJob({
        localAssetId: asset.id,
        op: "upload",
        nextRetryAt: queuedAt,
      })
    )
  );
};

const replaceAssetFileExtension = (fileName: string, extension: string) => {
  const baseName = fileName.replace(/\.[^/.]+$/, "");
  return `${baseName}.${extension}`;
};

const captureAssetStoreScope = () => ({
  epoch: assetStoreEpoch,
  userId: getCurrentUserId(),
});

const isAssetStoreScopeStale = (scope: ReturnType<typeof captureAssetStoreScope>) =>
  scope.epoch !== assetStoreEpoch || scope.userId !== getCurrentUserId();

ensurePersistFlushOnUnload();

export const useAssetStore = create<CurrentUserState>()(
  devtools(
    (set, get) => {
      const runRenderMaterialization = async (
        intent: RenderMaterializationIntent,
        assetId: string,
        layerId?: string
      ) => {
        const initialState = get();
        const asset = initialState.assets.find((entry) => entry.id === assetId) ?? null;
        if (!asset) {
          return false;
        }
        const initialSnapshot = createEditorAssetSnapshot(asset);

        const resolved = resolveRenderMaterialization({
          asset,
          assets: initialState.assets,
          intent,
          layerId,
        });
        if (!resolved.supported) {
          console.warn(describeRenderMaterializationUnsupportedReason(resolved.reason), {
            assetId,
            intent,
            layerId,
          });
          return false;
        }

        let rendered;
        try {
          rendered = await executeRenderMaterialization({
            asset,
            resolved: resolved.value,
          });
        } catch (error) {
          console.warn("Render-backed materialization failed.", {
            assetId,
            intent,
            layerId,
            error,
          });
          return false;
        }

        const currentState = get();
        const currentAsset = currentState.assets.find((entry) => entry.id === assetId) ?? null;
        if (!currentAsset) {
          return false;
        }
        const currentSnapshot = createEditorAssetSnapshot(currentAsset);

        if (
          currentAsset.name !== asset.name ||
          !isEditorAssetSnapshotEqual(initialSnapshot, currentSnapshot)
        ) {
          console.warn("Skipped render-backed materialization because the authoring state changed.", {
            assetId,
            intent,
            layerId,
          });
          return false;
        }

        if (
          !isRenderMaterializationPlanCurrent(resolved.value.plan, {
            asset: currentAsset,
            assets: currentState.assets,
            intent,
            layerId,
          })
        ) {
          console.warn("Skipped stale render-backed materialization plan.", {
            assetId,
            intent,
            layerId,
            renderGraphKey: resolved.value.plan.renderGraphKey,
          });
          return false;
        }

        const resetAdjustments = createDefaultAdjustments();
        const normalizedLayers = ensureAssetLayers({
          id: currentAsset.id,
          adjustments: resetAdjustments,
          layers: resolved.value.nextLayers,
        });

        let previousObjectUrl: string | null = null;
        let previousThumbnailUrl: string | null = null;
        let queuedAsset: Asset | null = null;

        set((state) => ({
          assets: state.assets.map((entry) => {
            if (entry.id !== assetId) {
              return entry;
            }

            const nextObjectUrl = URL.createObjectURL(rendered.blob);
            const nextThumbnailUrl = rendered.thumbnailBlob
              ? URL.createObjectURL(rendered.thumbnailBlob)
              : nextObjectUrl;
            previousObjectUrl = entry.objectUrl;
            previousThumbnailUrl =
              entry.thumbnailUrl && entry.thumbnailUrl !== entry.objectUrl
                ? entry.thumbnailUrl
                : null;

            queuedAsset = toQueuedUploadAsset({
              ...entry,
              name:
                rendered.type === entry.type
                  ? entry.name
                  : replaceAssetFileExtension(entry.name, rendered.extension),
              type: rendered.type,
              size: rendered.blob.size,
              blob: rendered.blob,
              objectUrl: nextObjectUrl,
              thumbnailBlob: rendered.thumbnailBlob,
              thumbnailUrl: nextThumbnailUrl,
              contentHash: rendered.contentHash,
              metadata: rendered.metadata,
              presetId: undefined,
              intensity: undefined,
              filmProfileId: undefined,
              filmProfile: undefined,
              filmOverrides: undefined,
              adjustments: resetAdjustments,
              layers: normalizedLayers,
            });

            return queuedAsset;
          }),
        }));

        if (previousObjectUrl) {
          URL.revokeObjectURL(previousObjectUrl);
        }
        if (previousThumbnailUrl) {
          URL.revokeObjectURL(previousThumbnailUrl);
        }
        if (!queuedAsset) {
          return false;
        }

        persistAsset(queuedAsset);
        enqueueUploadJobs([queuedAsset]);
        scheduleReferencedThumbnailRefreshes(assetId, set, get);
        return true;
      };

      return {
        currentUser: null,
        assets: [],
        isLoading: true,
        isImporting: false,
        importProgress: null,
        selectedAssetIds: [],

      init: async () => {
        if (pendingAssetInitPromise) {
          return pendingAssetInitPromise;
        }

        pendingAssetInitPromise = (async () => {
          set({ isLoading: true });
          assetStoreEpoch += 1;
          const initScope = captureAssetStoreScope();
          let currentUser = defaultCurrentUser();
          let committed = false;
          const hydratedAssets: Asset[] = [];
          const hydratedPairs: Array<{ asset: Asset; stored: StoredAsset }> = [];

          try {
          const userId = initScope.userId;
          lastRemoteChangeCursor = undefined;
          const storedCurrentUser = await loadCurrentUser(userId);
          currentUser = storedCurrentUser ?? defaultCurrentUser();
          if (!storedCurrentUser) {
            await saveCurrentUser(currentUser);
          }

          const storedAssets = await loadAssetsByUser(userId);
          const fallbackOwnerRef = { userId };
          const nowIso = new Date().toISOString();

          storedAssets.forEach((stored) => {
            const asset = materializeStoredAsset(stored, {
              fallbackOwnerRef,
              nowIso,
            });
            if (!asset) {
              return;
            }
            hydratedAssets.push(asset);
            hydratedPairs.push({ asset, stored });
          });

          if (hydratedAssets.length !== storedAssets.length) {
            console.warn(
              `Skipped ${storedAssets.length - hydratedAssets.length} malformed stored asset(s) during initialization.`
            );
          }

          lastRemoteChangeCursor = hydratedAssets.reduce<string | undefined>(
            (cursor, asset) => {
              if (!isRemotelyPersisted(asset)) {
                return cursor;
              }
              return latestIso(cursor, asset.remote?.lastSyncedAt ?? asset.remote?.updatedAt);
            },
            undefined
          );

          if (isAssetStoreScopeStale(initScope)) {
            revokeAssetUrls(hydratedAssets);
            return;
          }

          set((state) => {
            const nextSelection = state.selectedAssetIds.filter((id) =>
              hydratedAssets.some((asset) => asset.id === id)
            );

            revokeAssetUrls(state.assets);
            committed = true;

            return {
              currentUser,
              assets: hydratedAssets,
              isLoading: false,
              selectedAssetIds: nextSelection,
            };
          });

          if (isAssetStoreScopeStale(initScope)) {
            return;
          }

          const migrationPayloads = hydratedPairs
            .filter(({ asset, stored }) => {
              const storedImportDay = stored.importDay;
              const normalizedImportDay = asset.importDay;
              const storedTags = normalizeTags(stored.tags ?? []);
              const nextTags = asset.tags ?? [];
              return (
                storedImportDay !== normalizedImportDay ||
                storedTags.join("|") !== nextTags.join("|") ||
                !Array.isArray(stored.layers) ||
                stored.layers.length === 0
              );
            })
            .map(({ asset }) => toStoredAsset(asset))
            .filter(
              (payload): payload is NonNullable<ReturnType<typeof toStoredAsset>> => Boolean(payload)
            );

          if (migrationPayloads.length > 0) {
            void Promise.allSettled(migrationPayloads.map((payload) => saveAsset(payload)));
          }

          const existingSyncJobs = await loadAssetSyncJobsByUser(userId, 5000);
          const queuedUploadIds = new Set(
            existingSyncJobs
              .filter((job) => job.op === "upload")
              .map((job) => job.localAssetId)
          );
          const queuedDeleteIds = new Set(
            existingSyncJobs
              .filter((job) => job.op === "delete")
              .map((job) => job.localAssetId)
          );
          const legacyAssets = hydratedAssets.filter(
            (asset) =>
              (asset.remote?.status === "local_only" || !asset.remote) &&
              Boolean(asset.blob) &&
              !queuedUploadIds.has(asset.id)
          );
          if (legacyAssets.length > 0) {
            const queuedAt = syncNowIso();
            const jobs = legacyAssets.map((asset) =>
              createSyncJob({
                localAssetId: asset.id,
                op: "upload",
                nextRetryAt: queuedAt,
              })
            );
            await saveAssetSyncJobs(jobs);

            if (isAssetStoreScopeStale(initScope)) {
              return;
            }

            const updatedIds = new Set(legacyAssets.map((asset) => asset.id));
            set((state) => ({
              assets: state.assets.map((asset) =>
                updatedIds.has(asset.id)
                  ? withRemoteStatus(asset, "upload_queued", { lastError: undefined })
                  : asset
              ),
            }));
            legacyAssets
              .map((asset) => withRemoteStatus(asset, "upload_queued", { lastError: undefined }))
              .forEach(persistAsset);
          }

          const pendingDeleteAssets = hydratedAssets.filter(
            (asset) =>
              isRemotelyPersisted(asset) &&
              (asset.remote?.status === "delete_failed" || asset.remote?.status === "delete_queued") &&
              !queuedDeleteIds.has(asset.id)
          );
          if (pendingDeleteAssets.length > 0) {
            const queuedAt = syncNowIso();
            const jobs = pendingDeleteAssets.map((asset) =>
              createSyncJob({
                localAssetId: asset.id,
                op: "delete",
                nextRetryAt: queuedAt,
              })
            );
            await saveAssetSyncJobs(jobs);

            if (isAssetStoreScopeStale(initScope)) {
              return;
            }

            const recoveredDeletes = new Map(
              pendingDeleteAssets.map((asset) => [
                asset.id,
                withRemoteStatus(asset, "delete_queued", {
                  lastError: undefined,
                }),
              ])
            );
            set((state) => ({
              assets: state.assets.map((asset) => recoveredDeletes.get(asset.id) ?? asset),
            }));
            Array.from(recoveredDeletes.values()).forEach(persistAsset);
          }
          } catch (error) {
            if (!committed && hydratedAssets.length > 0) {
              revokeAssetUrls(hydratedAssets);
            }
            console.warn("Asset store initialization failed.", error);
            set((state) => ({
              currentUser: state.currentUser ?? currentUser,
              isLoading: false,
            }));
          }
        })().finally(() => {
          pendingAssetInitPromise = null;
        });

        return pendingAssetInitPromise;
      },

      importAssets: async (filesInput, options) => {
        const files = Array.isArray(filesInput) ? filesInput : Array.from(filesInput);
        if (files.length === 0) {
          return createEmptyImportResult();
        }

        const ownerRef = options?.ownerRef ?? { userId: getCurrentUserId() };

        set({
          isImporting: true,
          importProgress: { current: 0, total: files.length },
        });

        try {
          const existingAssets = get().assets;
          const importedAssets: Asset[] = [];
          let buffered: Asset[] = [];

          const commitBufferedAssets = () => {
            if (buffered.length === 0) {
              return;
            }
            const chunk = buffered;
            buffered = [];
            set((state) => ({
              assets: [...state.assets, ...chunk],
            }));
          };

          const result = await runImportPipeline({
            files,
            existingAssets,
            importOptions: {
              source: options?.source,
              origin: options?.origin,
              ownerRef,
            },
            onProgress: (progress) => {
              set({ importProgress: progress });
            },
            onAssetImported: (asset) => {
              importedAssets.push(asset);
              buffered.push(asset);
              if (buffered.length >= IMPORT_COMMIT_CHUNK_SIZE) {
                commitBufferedAssets();
              }
            },
          });

          commitBufferedAssets();

          const uploadQueuedAssets = importedAssets.filter(
            (asset) => asset.remote?.status === "upload_queued"
          );

          if (uploadQueuedAssets.length > 0) {
            const queuedAt = syncNowIso();
            await saveAssetSyncJobs(
              uploadQueuedAssets.map((asset) =>
                createSyncJob({
                  localAssetId: asset.id,
                  op: "upload",
                  nextRetryAt: queuedAt,
                })
              )
            );
            void get().runAssetSync();
          }

          if (result.added > 0) {
            const now = new Date().toISOString();
            const previousCurrentUser = get().currentUser;
            const nextCurrentUser = previousCurrentUser
              ? { ...previousCurrentUser, updatedAt: now }
              : defaultCurrentUser();

            try {
              await saveCurrentUser(nextCurrentUser);
            } catch (error) {
              console.warn("Failed to persist current user metadata after import", error);
            }

            set({ currentUser: nextCurrentUser });
            emit("assets:imported", result.addedAssetIds);
          }

          return result;
        } finally {
          set({ isImporting: false, importProgress: null });
        }
      },

      importAssetFromUrl: async (url) => {
        const input = url.trim();
        if (!input) {
          return createEmptyImportResult();
        }

        const response = await fetch(input);
        if (!response.ok) {
          throw new Error(`URL import failed: ${response.status} ${response.statusText}`);
        }
        const blob = await response.blob();
        if (!blob || blob.size === 0) {
          throw new Error("URL import failed: empty response.");
        }

        const type = blob.type || "image/jpeg";
        const urlPath = new URL(input, window.location.origin).pathname;
        const fileNameFromUrl = decodeURIComponent(urlPath.split("/").pop() || "").trim();
        const extension = type.includes("png")
          ? "png"
          : type.includes("webp")
            ? "webp"
            : type.includes("avif")
              ? "avif"
              : type.includes("tiff")
                ? "tiff"
                : "jpg";
        const fileName = fileNameFromUrl || `url-import-${Date.now()}.${extension}`;
        const file = new File([blob], fileName, {
          type,
          lastModified: Date.now(),
        });

        return get().importAssets([file], {
          source: "imported",
          origin: "url",
          ownerRef: { userId: getCurrentUserId() },
        });
      },

      materializeRemoteAssets: (inputs) => {
        if (inputs.length === 0) {
          return;
        }

        const nextById = new Map(inputs.map((input) => [input.assetId, input]));
        const touched: Asset[] = [];

        set((state) => {
          const nextAssets = state.assets.map((asset) => {
            const input = nextById.get(asset.id);
            if (!input) {
              return asset;
            }

            const merged = mergeRemoteAsset(asset, input);
            touched.push(merged);
            nextById.delete(asset.id);
            return merged;
          });

          for (const input of nextById.values()) {
            const merged = mergeRemoteAsset(undefined, input);
            touched.push(merged);
            nextAssets.push(merged);
          }

          return { assets: nextAssets };
        });

        touched.forEach((asset) => {
          if (asset.blob) {
            persistAsset(asset);
          }
        });
      },

      runAssetSync: async () => {
        if (isSyncRunning) {
          return;
        }
        isSyncRunning = true;
        const syncScope = captureAssetStoreScope();

        const reconcileRemoteChanges = async () => {
          try {
            if (isAssetStoreScopeStale(syncScope)) {
              return;
            }
            const changes = await fetchAssetChanges(lastRemoteChangeCursor);
            if (isAssetStoreScopeStale(syncScope)) {
              return;
            }
            if (changes.length === 0) {
              return;
            }

            lastRemoteChangeCursor = changes.reduce<string | undefined>(
              (cursor, change) => latestIso(cursor, change.updatedAt),
              lastRemoteChangeCursor
            );

            const changesByAssetId = new Map(changes.map((change) => [change.assetId, change]));
            const changesByHash = new Map(changes.map((change) => [change.contentHash, change]));
            const currentState = get();
            const updates = new Map<string, Asset>();
            const removeIds = new Set<string>();

            for (const asset of currentState.assets) {
              const byAssetId = changesByAssetId.get(asset.id);
              const change = byAssetId ?? (asset.contentHash ? changesByHash.get(asset.contentHash) : undefined);
              if (!change) {
                continue;
              }

              if (change.deletedAt) {
                removeIds.add(asset.id);
                continue;
              }

              const synced = withRemoteStatus(
                {
                  ...asset,
                  contentHash: asset.contentHash ?? change.contentHash,
                },
                "synced",
                {
                  lastError: undefined,
                  lastSyncedAt: change.updatedAt,
                }
              );
              updates.set(asset.id, synced);
            }

            if (updates.size === 0 && removeIds.size === 0) {
              return;
            }

            const removedAssets = currentState.assets.filter((asset) => removeIds.has(asset.id));
            if (removedAssets.length > 0) {
              cancelPendingPersists(new Set(removedAssets.map((asset) => asset.id)));
              revokeAssetUrls(removedAssets);
            }

            if (isAssetStoreScopeStale(syncScope)) {
              return;
            }
            set((state) => ({
              assets: state.assets
                .filter((asset) => !removeIds.has(asset.id))
                .map((asset) => updates.get(asset.id) ?? asset),
              selectedAssetIds: state.selectedAssetIds.filter((id) => !removeIds.has(id)),
            }));

            if (isAssetStoreScopeStale(syncScope)) {
              return;
            }
            updates.forEach((asset) => persistAsset(asset));
            if (removedAssets.length > 0) {
              const removedIds = new Set(removedAssets.map((asset) => asset.id));
              await Promise.allSettled(
                removedAssets.flatMap((asset) => [
                  deleteAssetSyncJobsByAssetId(asset.id),
                  deleteAsset(asset.id),
                ])
              );
              emit("assets:deleted", removedIds);
            }
          } catch (error) {
            console.warn("Failed to reconcile remote changes", error);
          }
        };

        try {
          const jobs = (await loadAssetSyncJobsByUser(syncScope.userId, 256)).filter((job) =>
            isSyncJobReady(job)
          );
          if (isAssetStoreScopeStale(syncScope)) {
            return;
          }
          const uploadJobs = jobs.filter((job) => job.op === "upload");
          const deleteJobs = jobs.filter((job) => job.op === "delete");
          const runUpload = pLimit(2);
          const runDelete = pLimit(1);

          if (jobs.length > 0) {
            await Promise.all([
              ...uploadJobs.map((job) =>
                runUpload(async () => {
                  const current = get().assets.find((asset) => asset.id === job.localAssetId);
                  if (!current?.blob) {
                    await deleteAssetSyncJob(job.jobId);
                    return;
                  }

                  let working = withRemoteStatus(current, "uploading", { lastError: undefined });
                  if (isAssetStoreScopeStale(syncScope)) {
                    return;
                  }
                  set((state) => ({
                    assets: state.assets.map((asset) =>
                      asset.id === current.id ? working : asset
                    ),
                  }));
                  persistAsset(working);

                  try {
                    const source = working.source ?? "imported";
                    const origin = working.origin ?? "file";
                    const workingBlob = working.blob;
                    if (!workingBlob) {
                      throw new Error("Missing blob for upload sync.");
                    }
                    let contentHash = working.contentHash;
                    if (!contentHash) {
                      contentHash = await sha256FromBlob(workingBlob);
                      if (isAssetStoreScopeStale(syncScope)) {
                        return;
                      }
                      working = {
                        ...working,
                        contentHash,
                      };
                      set((state) => ({
                        assets: state.assets.map((asset) =>
                          asset.id === current.id ? working : asset
                        ),
                      }));
                      persistAsset(working);
                    }
                    if (!contentHash) {
                      throw new Error("Missing content hash for sync upload.");
                    }

                    if (isAssetStoreScopeStale(syncScope)) {
                      return;
                    }
                    const prepared = await prepareAssetUpload({
                      assetId: current.id,
                      name: working.name,
                      type: working.type,
                      size: working.size,
                      createdAt: working.createdAt,
                      source,
                      origin,
                      contentHash,
                      tags: working.tags ?? [],
                      metadata: toMetadataRecord(working),
                      includeThumbnail: Boolean(working.thumbnailBlob),
                    });
                    if (isAssetStoreScopeStale(syncScope)) {
                      return;
                    }

                    if (prepared.assetId !== current.id) {
                      throw new Error(
                        `Asset sync identity mismatch for ${current.id}. Expected canonical assetId to remain stable.`
                      );
                    }

                    if (!prepared.existing) {
                      if (isAssetStoreScopeStale(syncScope)) {
                        return;
                      }
                      await uploadToAssetTarget(prepared.upload, workingBlob);
                      if (working.thumbnailBlob && prepared.thumbnailUpload) {
                        if (isAssetStoreScopeStale(syncScope)) {
                          return;
                        }
                        await uploadToAssetTarget(prepared.thumbnailUpload, working.thumbnailBlob);
                      }
                      if (isAssetStoreScopeStale(syncScope)) {
                        return;
                      }
                      const completed = await completeAssetUpload(prepared.assetId);
                      working = {
                        ...working,
                        objectUrl: completed.objectUrl,
                        thumbnailUrl: completed.thumbnailUrl,
                      };
                    }
                    if (isAssetStoreScopeStale(syncScope)) {
                      return;
                    }

                    const syncedSource = prepared.existing ? prepared.asset : null;
                    const synced = withRemoteStatus(working, "synced", {
                      lastError: undefined,
                      lastSyncedAt: syncedSource?.updatedAt ?? syncNowIso(),
                    });
                    const syncedAsset: Asset = {
                      ...synced,
                      ...(syncedSource
                        ? {
                            objectUrl: syncedSource.objectUrl,
                            thumbnailUrl: syncedSource.thumbnailUrl,
                          }
                        : {}),
                    };
                    set((state) => ({
                      assets: state.assets.map((asset) =>
                        asset.id === current.id ? syncedAsset : asset
                      ),
                    }));
                    persistAsset(syncedAsset);
                    await deleteAssetSyncJob(job.jobId);
                    lastRemoteChangeCursor = latestIso(
                      lastRemoteChangeCursor,
                      syncedAsset.remote?.lastSyncedAt ?? syncedAsset.remote?.updatedAt
                    );
                  } catch (error) {
                    if (isAssetStoreScopeStale(syncScope)) {
                      return;
                    }
                    const message = error instanceof Error ? error.message : "Upload sync failed.";
                    const failedJob = withSyncJobFailure(job, message);
                    if (failedJob.attempts >= MAX_SYNC_ATTEMPTS) {
                      await deleteAssetSyncJob(job.jobId);
                      const failed = withRemoteStatus(working, "upload_failed", {
                        lastError: message,
                      });
                      set((state) => ({
                        assets: state.assets.map((asset) =>
                          asset.id === current.id ? failed : asset
                        ),
                      }));
                      persistAsset(failed);
                      return;
                    }

                    await saveAssetSyncJob(failedJob);
                    const requeued = withRemoteStatus(working, "upload_queued", {
                      lastError: message,
                    });
                    set((state) => ({
                      assets: state.assets.map((asset) =>
                        asset.id === current.id ? requeued : asset
                      ),
                    }));
                    persistAsset(requeued);
                  }
                })
              ),
              ...deleteJobs.map((job) =>
                runDelete(async () => {
                  const current = get().assets.find((asset) => asset.id === job.localAssetId);
                  const assetId = current?.id ?? job.localAssetId;
                  if (current && !isRemotelyPersisted(current)) {
                    await deleteAssetSyncJob(job.jobId);
                    return;
                  }

                  let deletingAsset: Asset | null = null;
                  if (current) {
                    const deleting = withRemoteStatus(current, "deleting", {
                      lastError: undefined,
                    });
                    deletingAsset = deleting;
                    if (isAssetStoreScopeStale(syncScope)) {
                      return;
                    }
                    set((state) => ({
                      assets: state.assets.map((asset) =>
                        asset.id === current.id ? deleting : asset
                      ),
                    }));
                    persistAsset(deleting);
                  }

                  try {
                    if (isAssetStoreScopeStale(syncScope)) {
                      return;
                    }
                    await deleteRemoteAsset(assetId);
                    if (isAssetStoreScopeStale(syncScope)) {
                      return;
                    }
                    await deleteAssetSyncJob(job.jobId);

                    if (deletingAsset) {
                      const deleted = withRemoteStatus(deletingAsset, "deleted", {
                        lastError: undefined,
                        lastSyncedAt: syncNowIso(),
                      });
                      set((state) => ({
                        assets: state.assets.filter((asset) => asset.id !== deleted.id),
                        selectedAssetIds: state.selectedAssetIds.filter((id) => id !== deleted.id),
                      }));
                      cancelPendingPersists(new Set([deleted.id]));
                      revokeAssetUrls([deleted]);
                      await Promise.allSettled([
                        deleteAssetSyncJobsByAssetId(deleted.id),
                        deleteAsset(deleted.id),
                      ]);
                      lastRemoteChangeCursor = latestIso(
                        lastRemoteChangeCursor,
                        deleted.remote?.lastSyncedAt ?? deleted.remote?.updatedAt
                      );
                    }
                  } catch (error) {
                    if (isAssetStoreScopeStale(syncScope)) {
                      return;
                    }
                    const message = error instanceof Error ? error.message : "Delete sync failed.";
                    const failedJob = withSyncJobFailure(job, message);
                    if (failedJob.attempts >= MAX_SYNC_ATTEMPTS) {
                      await deleteAssetSyncJob(job.jobId);
                      if (deletingAsset) {
                        const failed = withRemoteStatus(deletingAsset, "delete_failed", {
                          lastError: message,
                        });
                        set((state) => ({
                          assets: state.assets.map((asset) =>
                            asset.id === failed.id ? failed : asset
                          ),
                        }));
                        persistAsset(failed);
                      }
                      return;
                    }

                    await saveAssetSyncJob(failedJob);
                    if (deletingAsset) {
                      const requeued = withRemoteStatus(deletingAsset, "delete_queued", {
                        lastError: message,
                      });
                      set((state) => ({
                        assets: state.assets.map((asset) =>
                          asset.id === requeued.id ? requeued : asset
                        ),
                      }));
                      persistAsset(requeued);
                    }
                  }
                })
              ),
            ]);
          }

          await reconcileRemoteChanges();
        } finally {
          isSyncRunning = false;
        }
      },

      retryAssetSyncForAsset: async (assetId) => {
        const asset = get().assets.find((item) => item.id === assetId);
        if (!asset?.blob) {
          return;
        }

        const nextJob = createSyncJob({
          localAssetId: asset.id,
          op: "upload",
          nextRetryAt: syncNowIso(),
        });
        await saveAssetSyncJob(nextJob);
        const queued = withRemoteStatus(asset, "upload_queued", { lastError: undefined });
        set((state) => ({
          assets: state.assets.map((item) => (item.id === asset.id ? queued : item)),
        }));
        persistAsset(queued);
        void get().runAssetSync();
      },

      applyPresetToDay: (day, presetId, intensity) => {
        let changed: Asset[] = [];
        set((state) => {
          const result = applyPresetToAssets(
            state.assets,
            (asset) => resolveAssetImportDay(asset) === day,
            presetId,
            intensity
          );
          changed = result.changed;
          return { assets: result.nextAssets };
        });
        const queued = changed.map(toQueuedUploadAsset);
        if (queued.length > 0) {
          const queuedById = new Map(queued.map((asset) => [asset.id, asset]));
          set((state) => ({
            assets: state.assets.map((asset) => queuedById.get(asset.id) ?? asset),
          }));
          queued.forEach(persistAsset);
          enqueueUploadJobs(queued);
          queued.forEach((asset) => {
            scheduleRenderedThumbnailRefresh(asset.id, set, get);
            scheduleReferencedThumbnailRefreshes(asset.id, set, get);
          });
        }
      },

      applyPresetToSelection: (assetIds, presetId, intensity) => {
        const selected = new Set(assetIds);
        let changed: Asset[] = [];
        set((state) => {
          const result = applyPresetToAssets(
            state.assets,
            (asset) => selected.has(asset.id),
            presetId,
            intensity
          );
          changed = result.changed;
          return { assets: result.nextAssets };
        });
        const queued = changed.map(toQueuedUploadAsset);
        if (queued.length > 0) {
          const queuedById = new Map(queued.map((asset) => [asset.id, asset]));
          set((state) => ({
            assets: state.assets.map((asset) => queuedById.get(asset.id) ?? asset),
          }));
          queued.forEach(persistAsset);
          enqueueUploadJobs(queued);
          queued.forEach((asset) => {
            scheduleRenderedThumbnailRefresh(asset.id, set, get);
            scheduleReferencedThumbnailRefreshes(asset.id, set, get);
          });
        }
      },

      updateAsset: (assetId, update) => {
        const normalizedUpdate = normalizeAssetUpdate(update);
        const nextAssets = get().assets.map((asset) =>
          asset.id === assetId ? applyNormalizedAssetUpdate(asset, normalizedUpdate) : asset
        );
        const updatedAsset = nextAssets.find((asset) => asset.id === assetId);
        const queued = updatedAsset ? toQueuedUploadAsset(updatedAsset) : null;
        if (updatedAsset) {
          persistAsset(queued ?? updatedAsset);
          enqueueUploadJobs(queued ? [queued] : [updatedAsset]);
        }
        set({
          assets: nextAssets.map((asset) => (queued && asset.id === assetId ? queued : asset)),
        });
        if (shouldRefreshRenderedThumbnail(normalizedUpdate)) {
          scheduleRenderedThumbnailRefresh(assetId, set, get);
        }
        if (shouldRefreshReferencedRenderedThumbnails(normalizedUpdate)) {
          scheduleReferencedThumbnailRefreshes(assetId, set, get);
        }
      },

      updateAssetOnly: (assetId, update) => {
        const normalizedUpdate = normalizeAssetUpdate(update);
        const nextAssets = get().assets.map((asset) =>
          asset.id === assetId ? applyNormalizedAssetUpdate(asset, normalizedUpdate) : asset
        );
        set({ assets: nextAssets });
      },

      addLayer: (assetId, layer) => {
        let changed: Asset | null = null;
        set((state) => ({
          assets: state.assets.map((asset) => {
            if (asset.id !== assetId) {
              return asset;
            }
            changed = withLayerMutation(asset, (layers) =>
              layer.type === "base" ? [...layers, layer] : [layer, ...layers]
            );
            return changed;
          }),
        }));
        if (changed) {
          const queued = toQueuedUploadAsset(changed);
          set((state) => ({
            assets: state.assets.map((asset) => (asset.id === queued.id ? queued : asset)),
          }));
          persistAsset(queued);
          enqueueUploadJobs([queued]);
          scheduleRenderedThumbnailRefresh(assetId, set, get);
        }
      },

      removeLayer: (assetId, layerId) => {
        let changed: Asset | null = null;
        set((state) => ({
          assets: state.assets.map((asset) => {
            if (asset.id !== assetId) {
              return asset;
            }
            changed = withLayerMutation(asset, (layers) => {
              if (layers.length <= 1) {
                return layers;
              }
              const target = layers.find((layer) => layer.id === layerId);
              if (!target || target.type === "base") {
                return layers;
              }
              return layers.filter((layer) => layer.id !== layerId);
            });
            return changed;
          }),
        }));
        if (changed) {
          const queued = toQueuedUploadAsset(changed);
          set((state) => ({
            assets: state.assets.map((asset) => (asset.id === queued.id ? queued : asset)),
          }));
          persistAsset(queued);
          enqueueUploadJobs([queued]);
          scheduleRenderedThumbnailRefresh(assetId, set, get);
        }
      },

      updateLayer: (assetId, layerId, patch) => {
        let changed: Asset | null = null;
        set((state) => ({
          assets: state.assets.map((asset) => {
            if (asset.id !== assetId) {
              return asset;
            }
            changed = withLayerMutation(asset, (layers) =>
              layers.map((layer) => (layer.id === layerId ? { ...layer, ...patch } : layer))
            );
            return changed;
          }),
        }));
        if (changed) {
          const queued = toQueuedUploadAsset(changed);
          set((state) => ({
            assets: state.assets.map((asset) => (asset.id === queued.id ? queued : asset)),
          }));
          persistAsset(queued);
          enqueueUploadJobs([queued]);
          scheduleRenderedThumbnailRefresh(assetId, set, get);
        }
      },

      moveLayer: (assetId, layerId, direction) => {
        let changed: Asset | null = null;
        set((state) => ({
          assets: state.assets.map((asset) => {
            if (asset.id !== assetId) {
              return asset;
            }
            changed = withLayerMutation(asset, (layers) =>
              moveLayerByDirection(layers, layerId, direction)
            );
            return changed;
          }),
        }));
        if (changed) {
          const queued = toQueuedUploadAsset(changed);
          set((state) => ({
            assets: state.assets.map((asset) => (asset.id === queued.id ? queued : asset)),
          }));
          persistAsset(queued);
          enqueueUploadJobs([queued]);
          scheduleRenderedThumbnailRefresh(assetId, set, get);
        }
      },

      duplicateLayer: (assetId, layerId) => {
        let changed: Asset | null = null;
        set((state) => ({
          assets: state.assets.map((asset) => {
            if (asset.id !== assetId) {
              return asset;
            }
            changed = withLayerMutation(asset, (layers) => {
              const sourceIndex = layers.findIndex((layer) => layer.id === layerId);
              if (sourceIndex < 0) {
                return layers;
              }
              const source = layers[sourceIndex]!;
              const duplicate: EditorLayer = {
                ...source,
                id: createId("layer-id"),
                type: source.type === "base" ? "duplicate" : source.type,
                name: `${source.name} Copy`,
              };
              const nextLayers = cloneEditorLayers(layers);
              nextLayers.splice(sourceIndex, 0, duplicate);
              return nextLayers;
            });
            return changed;
          }),
        }));
        if (changed) {
          const queued = toQueuedUploadAsset(changed);
          set((state) => ({
            assets: state.assets.map((asset) => (asset.id === queued.id ? queued : asset)),
          }));
          persistAsset(queued);
          enqueueUploadJobs([queued]);
          scheduleRenderedThumbnailRefresh(assetId, set, get);
        }
      },

      mergeLayerDown: (assetId, layerId) =>
        runRenderMaterialization("merge-down", assetId, layerId),

      flattenLayers: (assetId) =>
        runRenderMaterialization("flatten", assetId),

      setSelectedAssetIds: (assetIds) => {
        const unique = Array.from(new Set(assetIds));
        set({ selectedAssetIds: unique });
      },

      clearAssetSelection: () => {
        set({ selectedAssetIds: [] });
      },

      setAssetTags: (assetId, tags) => {
        const normalized = normalizeTags(tags);
        let changed: Asset | null = null;

        set((state) => {
          const nextAssets = state.assets.map((asset) => {
            if (asset.id !== assetId) {
              return asset;
            }
            changed = {
              ...asset,
              tags: normalized,
            };
            return changed;
          });
          return { assets: nextAssets };
        });

        if (changed) {
          const queued = toQueuedUploadAsset(changed);
          set((state) => ({
            assets: state.assets.map((asset) => (asset.id === queued.id ? queued : asset)),
          }));
          persistAsset(queued);
          enqueueUploadJobs([queued]);
        }
      },

      addTagsToAssets: (assetIds, tags) => {
        const ids = new Set(assetIds);
        const incomingTags = normalizeTags(tags);
        if (ids.size === 0 || incomingTags.length === 0) {
          return;
        }

        const changed: Asset[] = [];
        set((state) => {
          const nextAssets = state.assets.map((asset) => {
            if (!ids.has(asset.id)) {
              return asset;
            }
            const nextTags = mergeTags(asset.tags, incomingTags);
            if ((asset.tags ?? []).join("|") === nextTags.join("|")) {
              return asset;
            }
            const updated = {
              ...asset,
              tags: nextTags,
            };
            changed.push(updated);
            return updated;
          });
          return { assets: nextAssets };
        });

        const queued = changed.map(toQueuedUploadAsset);
        if (queued.length > 0) {
          const queuedById = new Map(queued.map((asset) => [asset.id, asset]));
          set((state) => ({
            assets: state.assets.map((asset) => queuedById.get(asset.id) ?? asset),
          }));
          queued.forEach(persistAsset);
          enqueueUploadJobs(queued);
        }
      },

      removeTagsFromAssets: (assetIds, tags) => {
        const ids = new Set(assetIds);
        const removingTags = normalizeTags(tags);
        if (ids.size === 0 || removingTags.length === 0) {
          return;
        }

        const changed: Asset[] = [];
        set((state) => {
          const nextAssets = state.assets.map((asset) => {
            if (!ids.has(asset.id)) {
              return asset;
            }
            const nextTags = removeTags(asset.tags, removingTags);
            if ((asset.tags ?? []).join("|") === nextTags.join("|")) {
              return asset;
            }
            const updated = {
              ...asset,
              tags: nextTags,
            };
            changed.push(updated);
            return updated;
          });
          return { assets: nextAssets };
        });

        const queued = changed.map(toQueuedUploadAsset);
        if (queued.length > 0) {
          const queuedById = new Map(queued.map((asset) => [asset.id, asset]));
          set((state) => ({
            assets: state.assets.map((asset) => queuedById.get(asset.id) ?? asset),
          }));
          queued.forEach(persistAsset);
          enqueueUploadJobs(queued);
        }
      },

      deleteAssets: async (assetIds) => {
        const idsToDelete = new Set(assetIds);
        if (idsToDelete.size === 0) {
          return;
        }

        const { assets, selectedAssetIds } = get();
        const targets = assets.filter((asset) => idsToDelete.has(asset.id));
        const remoteDeleteAssets = targets.filter((asset) => isRemotelyPersisted(asset));
        const localDeleteAssets = targets.filter((asset) => !isRemotelyPersisted(asset));

        const queuedRemoteDeletes = remoteDeleteAssets.map((asset) =>
          withRemoteStatus(asset, "delete_queued", {
            lastError: undefined,
          })
        );

        if (queuedRemoteDeletes.length > 0) {
          await Promise.allSettled(
            queuedRemoteDeletes.map((asset) => deleteAssetSyncJobsByAssetId(asset.id))
          );
          await saveAssetSyncJobs(
            queuedRemoteDeletes.map((asset) =>
              createSyncJob({
                localAssetId: asset.id,
                op: "delete",
                nextRetryAt: syncNowIso(),
              })
            )
          );
          queuedRemoteDeletes.forEach(persistAsset);
        }

        if (localDeleteAssets.length > 0) {
          const localDeleteIds = new Set(localDeleteAssets.map((asset) => asset.id));
          cancelPendingPersists(localDeleteIds);
          revokeAssetUrls(localDeleteAssets);
          await Promise.allSettled(
            localDeleteAssets.flatMap((asset) => [
              deleteAssetSyncJobsByAssetId(asset.id),
              deleteAsset(asset.id),
            ])
          );
        }

        const localDeleteIdSet = new Set(localDeleteAssets.map((asset) => asset.id));
        const queuedById = new Map(queuedRemoteDeletes.map((asset) => [asset.id, asset]));

        set({
          assets: assets
            .filter((asset) => !localDeleteIdSet.has(asset.id))
            .map((asset) => queuedById.get(asset.id) ?? asset),
          selectedAssetIds: selectedAssetIds.filter((id) => !idsToDelete.has(id)),
        });

        emit("assets:deleted", idsToDelete);

        if (queuedRemoteDeletes.length > 0) {
          void get().runAssetSync();
        }
      },

      resetCurrentUser: async () => {
        assetStoreEpoch += 1;
        lastRemoteChangeCursor = undefined;
        emit("currentUser:reset");
        await flushPendingPersists();
        const userId = getCurrentUserId();
        revokeAssetUrls(get().assets);
        await clearAssetSyncJobsByUser(userId);
        await clearAssetsByUser(userId);
        await clearCanvasWorkbenchesByUser(userId);

        const currentUser = defaultCurrentUser();
        await saveCurrentUser(currentUser);

        set({
          currentUser,
          assets: [],
          isImporting: false,
          importProgress: null,
          selectedAssetIds: [],
        });
      },
      };
    },
    { name: "AssetStore", enabled: process.env.NODE_ENV === "development" }
  )
);

useAssetStore.subscribe((state, previousState) => {
  if (state.assets === previousState.assets) {
    return;
  }

  const previousAssetById = new Map(previousState.assets.map((asset) => [asset.id, asset]));
  const changedAssets = new Map<string, Asset | null>();

  for (const asset of state.assets) {
    const previousAsset = previousAssetById.get(asset.id);
    if (previousAsset !== asset) {
      changedAssets.set(asset.id, asset);
    }
    previousAssetById.delete(asset.id);
  }

  for (const removedAssetId of previousAssetById.keys()) {
    changedAssets.set(removedAssetId, null);
  }

  if (changedAssets.size > 0) {
    emit("assets:changed", changedAssets);
  }
});

export type { AddAssetsResult } from "./currentUser/types";
export {
  selectAssets,
  selectImportProgress,
  selectIsImporting,
  selectIsLoading,
  selectCurrentUser,
  selectSelectedAssetIds,
};

