import { create } from "zustand";
import { devtools } from "zustand/middleware";
import pLimit from "p-limit";
import { presets } from "@/data/presets";
import { normalizeAdjustments } from "@/lib/adjustments";
import {
  completeAssetUpload,
  fetchAssetChanges,
  deleteRemoteAsset,
  presignAssetUpload,
  uploadToPresignedTarget,
} from "@/lib/assetSyncApi";
import { getCurrentUserId } from "@/lib/authToken";
import { sha256FromBlob } from "@/lib/hash";
import {
  cloneEditorLayers,
  createBaseLayer,
  createEditorLayerId,
  ensureAssetLayers,
  moveLayerByDirection,
  resolveBaseAdjustmentsFromLayers,
  resolveLayerAdjustments,
  resolveBaseLayer,
} from "@/lib/editorLayers";
import {
  clearAssets,
  clearCanvasDocuments,
  deleteAsset,
  deleteAssetSyncJob,
  deleteAssetSyncJobsByAssetId,
  loadAssetSyncJobs,
  loadAssets,
  loadProject,
  saveAssetSyncJob,
  saveAssetSyncJobs,
  saveAsset,
  saveProject,
  type StoredAsset,
} from "@/lib/db";
import { emit } from "@/lib/storeEvents";
import { loadCustomPresets } from "@/features/editor/presetUtils";
import type { Asset, AssetRemoteSyncStatus, EditorLayer } from "@/types";
import {
  DEFAULT_PROJECT_ID,
  DEFAULT_PROJECT_NAME,
  IMPORT_COMMIT_CHUNK_SIZE,
  LEGACY_PROJECT_ID,
} from "./project/constants";
import { resolveAssetImportDay } from "./project/grouping";
import { runImportPipeline } from "./project/importPipeline";
import {
  cancelPendingPersists,
  ensurePersistFlushOnUnload,
  flushPendingPersists,
  normalizeAssetUpdate,
  persistAsset,
  toStoredAsset,
} from "./project/persistence";
import { materializeStoredAsset } from "./project/runtimeAsset";
import { MAX_SYNC_ATTEMPTS, createSyncJob, isSyncJobReady, withSyncJobFailure } from "./project/sync";
import { selectAssets, selectImportProgress, selectIsImporting, selectIsLoading, selectProject, selectSelectedAssetIds } from "./project/selectors";
import { mergeTags, normalizeTags, removeTags } from "./project/tagging";
import type { AddAssetsResult, ProjectState } from "./project/types";

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

const defaultProject = () => {
  const now = new Date().toISOString();
  return {
    id: DEFAULT_PROJECT_ID,
    name: DEFAULT_PROJECT_NAME,
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
let lastRemoteChangeCursor: string | undefined;

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

ensurePersistFlushOnUnload();

export const useAssetStore = create<ProjectState>()(
  devtools(
    (set, get) => ({
      project: null,
      assets: [],
      isLoading: true,
      isImporting: false,
      importProgress: null,
      selectedAssetIds: [],

      init: async () => {
        set({ isLoading: true });
        let project = defaultProject();
        let committed = false;
        const hydratedAssets: Asset[] = [];
        const hydratedPairs: Array<{ asset: Asset; stored: StoredAsset }> = [];

        try {
          let storedProject = await loadProject(DEFAULT_PROJECT_ID);
          if (!storedProject) {
            const legacyProject = await loadProject(LEGACY_PROJECT_ID);
            if (legacyProject) {
              storedProject = {
                ...legacyProject,
                id: DEFAULT_PROJECT_ID,
              };
              await saveProject(storedProject);
            }
          }

          project = storedProject ?? defaultProject();
          if (!storedProject) {
            await saveProject(project);
          }

          const storedAssets = await loadAssets();
          const fallbackOwnerRef = { userId: getCurrentUserId() };
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
              if (!asset.remote?.remoteAssetId) {
                return cursor;
              }
              return latestIso(cursor, asset.remote.lastSyncedAt ?? asset.remote.updatedAt);
            },
            lastRemoteChangeCursor
          );

          set((state) => {
            const nextSelection = state.selectedAssetIds.filter((id) =>
              hydratedAssets.some((asset) => asset.id === id)
            );

            revokeAssetUrls(state.assets);
            committed = true;

            return {
              project,
              assets: hydratedAssets,
              isLoading: false,
              selectedAssetIds: nextSelection,
            };
          });

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

          const existingSyncJobs = await loadAssetSyncJobs(5000);
          const queuedUploadIds = new Set(
            existingSyncJobs
              .filter((job) => job.op === "upload")
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
        } catch (error) {
          if (!committed && hydratedAssets.length > 0) {
            revokeAssetUrls(hydratedAssets);
          }
          console.warn("Asset store initialization failed.", error);
          set((state) => ({
            project: state.project ?? project,
            isLoading: false,
          }));
        }
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

          if (importedAssets.length > 0) {
            const queuedAt = syncNowIso();
            await saveAssetSyncJobs(
              importedAssets.map((asset) =>
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
            const previousProject = get().project;
            const nextProject = previousProject
              ? { ...previousProject, updatedAt: now }
              : defaultProject();

            try {
              await saveProject(nextProject);
            } catch (error) {
              console.warn("Failed to persist project after import", error);
            }

            set({ project: nextProject });
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

      runAssetSync: async () => {
        if (isSyncRunning) {
          return;
        }
        isSyncRunning = true;

        const reconcileRemoteChanges = async () => {
          try {
            const changes = await fetchAssetChanges(lastRemoteChangeCursor);
            if (changes.length === 0) {
              return;
            }

            lastRemoteChangeCursor = changes.reduce<string | undefined>(
              (cursor, change) => latestIso(cursor, change.updatedAt),
              lastRemoteChangeCursor
            );

            const changesByRemoteId = new Map(changes.map((change) => [change.remoteAssetId, change]));
            const changesByHash = new Map(changes.map((change) => [change.contentHash, change]));
            const currentState = get();
            const updates = new Map<string, Asset>();
            const removeIds = new Set<string>();

            for (const asset of currentState.assets) {
              const byRemoteId = asset.remote?.remoteAssetId
                ? changesByRemoteId.get(asset.remote.remoteAssetId)
                : undefined;
              const change = byRemoteId ?? (asset.contentHash ? changesByHash.get(asset.contentHash) : undefined);
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
                  remoteAssetId: change.remoteAssetId,
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

            set((state) => ({
              assets: state.assets
                .filter((asset) => !removeIds.has(asset.id))
                .map((asset) => updates.get(asset.id) ?? asset),
              selectedAssetIds: state.selectedAssetIds.filter((id) => !removeIds.has(id)),
            }));

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
          const jobs = (await loadAssetSyncJobs(256)).filter((job) => isSyncJobReady(job));
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

                    const prepared = await presignAssetUpload({
                      localAssetId: current.id,
                      name: working.name,
                      type: working.type,
                      size: working.size,
                      createdAt: working.createdAt,
                      source,
                      origin,
                      contentHash,
                      tags: working.tags ?? [],
                      metadata: toMetadataRecord(working),
                    });

                    if (!prepared.existing) {
                      await uploadToPresignedTarget(prepared.upload, workingBlob);
                      if (working.thumbnailBlob && prepared.thumbnailUpload) {
                        await uploadToPresignedTarget(prepared.thumbnailUpload, working.thumbnailBlob);
                      }
                      await completeAssetUpload({
                        remoteAssetId: prepared.remoteAssetId,
                        localAssetId: current.id,
                        objectKey: prepared.objectKey,
                        thumbnailKey: prepared.thumbnailKey,
                        name: working.name,
                        type: working.type,
                        size: working.size,
                        createdAt: working.createdAt,
                        source,
                        origin,
                        contentHash,
                        tags: working.tags ?? [],
                        metadata: toMetadataRecord(working),
                      });
                    }

                    const synced = withRemoteStatus(working, "synced", {
                      remoteAssetId: prepared.remoteAssetId,
                      lastError: undefined,
                      lastSyncedAt:
                        ("updatedAt" in prepared ? prepared.updatedAt : undefined) ?? syncNowIso(),
                    });
                    set((state) => ({
                      assets: state.assets.map((asset) =>
                        asset.id === current.id ? synced : asset
                      ),
                    }));
                    persistAsset(synced);
                    await deleteAssetSyncJob(job.jobId);
                    lastRemoteChangeCursor = latestIso(
                      lastRemoteChangeCursor,
                      synced.remote?.lastSyncedAt ?? synced.remote?.updatedAt
                    );
                  } catch (error) {
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
                  const remoteAssetId = job.remoteAssetId ?? current?.remote?.remoteAssetId;
                  if (!remoteAssetId) {
                    await deleteAssetSyncJob(job.jobId);
                    return;
                  }

                  let deletingAsset: Asset | null = null;
                  if (current) {
                    const deleting = withRemoteStatus(current, "deleting", {
                      remoteAssetId,
                      lastError: undefined,
                    });
                    deletingAsset = deleting;
                    set((state) => ({
                      assets: state.assets.map((asset) =>
                        asset.id === current.id ? deleting : asset
                      ),
                    }));
                    persistAsset(deleting);
                  }

                  try {
                    await deleteRemoteAsset(remoteAssetId);
                    await deleteAssetSyncJob(job.jobId);

                    if (deletingAsset) {
                      const deleted = withRemoteStatus(deletingAsset, "deleted", {
                        remoteAssetId,
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
                    const message = error instanceof Error ? error.message : "Delete sync failed.";
                    const failedJob = withSyncJobFailure(job, message);
                    if (failedJob.attempts >= MAX_SYNC_ATTEMPTS) {
                      await deleteAssetSyncJob(job.jobId);
                      if (deletingAsset) {
                        const failed = withRemoteStatus(deletingAsset, "delete_failed", {
                          remoteAssetId,
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
                        remoteAssetId,
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
                id: createEditorLayerId("layer"),
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
        }
      },

      mergeLayerDown: (assetId, layerId) => {
        let changed: Asset | null = null;
        set((state) => ({
          assets: state.assets.map((asset) => {
            if (asset.id !== assetId) {
              return asset;
            }
            changed = withLayerMutation(asset, (layers) => {
              const index = layers.findIndex((layer) => layer.id === layerId);
              if (index < 0 || index >= layers.length - 1) {
                return layers;
              }
              const current = layers[index]!;
              const below = layers[index + 1]!;
              if (current.type === "base") {
                return layers;
              }

              const mergedAdjustments = {
                ...resolveLayerAdjustments(below, asset.adjustments),
                ...(current.adjustments ?? {}),
              };

              const nextLayers = cloneEditorLayers(layers);
              nextLayers[index + 1] = {
                ...below,
                adjustments: mergedAdjustments,
              };
              nextLayers.splice(index, 1);
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
        }
      },

      flattenLayers: (assetId) => {
        let changed: Asset | null = null;
        set((state) => ({
          assets: state.assets.map((asset) => {
            if (asset.id !== assetId) {
              return asset;
            }
            changed = withLayerMutation(asset, (layers) => {
              const base = resolveBaseLayer(layers) ?? createBaseLayer(asset);
              let flattenedAdjustments = resolveLayerAdjustments(base, asset.adjustments);
              for (const layer of [...layers].reverse()) {
                if (layer.id === base.id || !layer.visible || !layer.adjustments) {
                  continue;
                }
                flattenedAdjustments = {
                  ...flattenedAdjustments,
                  ...layer.adjustments,
                };
              }
              return [
                {
                  ...base,
                  name: "Background",
                  type: "base",
                  visible: true,
                  opacity: 100,
                  blendMode: "normal",
                  adjustments: flattenedAdjustments,
                },
              ];
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
        }
      },

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
        const remoteDeleteAssets = targets.filter((asset) => Boolean(asset.remote?.remoteAssetId));
        const localDeleteAssets = targets.filter((asset) => !asset.remote?.remoteAssetId);

        const queuedRemoteDeletes = remoteDeleteAssets.map((asset) =>
          withRemoteStatus(asset, "delete_queued", {
            remoteAssetId: asset.remote?.remoteAssetId,
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
                remoteAssetId: asset.remote?.remoteAssetId,
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

      resetProject: async () => {
        await flushPendingPersists();
        revokeAssetUrls(get().assets);
        await clearAssets();
        await clearCanvasDocuments();

        const project = defaultProject();
        await saveProject(project);

        set({
          project,
          assets: [],
          selectedAssetIds: [],
        });

        emit("project:reset");
      },
    }),
    { name: "AssetStore", enabled: process.env.NODE_ENV === "development" }
  )
);

export type { AddAssetsResult } from "./project/types";
export {
  selectAssets,
  selectImportProgress,
  selectIsImporting,
  selectIsLoading,
  selectProject,
  selectSelectedAssetIds,
};

