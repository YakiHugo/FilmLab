import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { presets } from "@/data/presets";
import { createDefaultAdjustments, normalizeAdjustments } from "@/lib/adjustments";
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
  clearChatSessions,
  deleteAsset,
  loadAssets,
  loadProject,
  saveAsset,
  saveProject,
} from "@/lib/db";
import { emit } from "@/lib/storeEvents";
import { loadCustomPresets } from "@/features/editor/presetUtils";
import type { Asset, EditorLayer } from "@/types";
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

        const project = storedProject ?? defaultProject();
        if (!storedProject) {
          await saveProject(project);
        }

        const storedAssets = await loadAssets();
        const assets: Asset[] = storedAssets.map((stored) => {
          const objectUrl = URL.createObjectURL(stored.blob);
          const thumbnailUrl = stored.thumbnailBlob
            ? URL.createObjectURL(stored.thumbnailBlob)
            : objectUrl;
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
            thumbnailBlob: stored.thumbnailBlob,
            metadata: stored.metadata,
            adjustments: resolveBaseAdjustmentsFromLayers(normalizedLayers, normalizedAdjustments),
            layers: normalizedLayers,
            aiRecommendation: stored.aiRecommendation,
            source: stored.source,
          };
        });

        set((state) => {
          const nextSelection = state.selectedAssetIds.filter((id) =>
            assets.some((asset) => asset.id === id)
          );

          revokeAssetUrls(state.assets);

          return {
            project,
            assets,
            isLoading: false,
            selectedAssetIds: nextSelection,
          };
        });

        const migrationPayloads = assets
          .filter((asset, index) => {
            const stored = storedAssets[index];
            if (!stored) {
              return false;
            }
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
          .map((asset) => toStoredAsset(asset))
          .filter((payload): payload is NonNullable<ReturnType<typeof toStoredAsset>> => Boolean(payload));

        if (migrationPayloads.length > 0) {
          void Promise.allSettled(migrationPayloads.map((payload) => saveAsset(payload)));
        }
      },

      importAssets: async (filesInput) => {
        const files = Array.isArray(filesInput) ? filesInput : Array.from(filesInput);
        if (files.length === 0) {
          return createEmptyImportResult();
        }

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
        changed.forEach(persistAsset);
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
        changed.forEach(persistAsset);
      },

      updateAsset: (assetId, update) => {
        const normalizedUpdate = normalizeAssetUpdate(update);
        const nextAssets = get().assets.map((asset) =>
          asset.id === assetId ? applyNormalizedAssetUpdate(asset, normalizedUpdate) : asset
        );
        const updatedAsset = nextAssets.find((asset) => asset.id === assetId);
        if (updatedAsset) {
          persistAsset(updatedAsset);
        }
        set({ assets: nextAssets });
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
          persistAsset(changed);
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
          persistAsset(changed);
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
          persistAsset(changed);
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
          persistAsset(changed);
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
          persistAsset(changed);
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
          persistAsset(changed);
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
          persistAsset(changed);
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
          persistAsset(changed);
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

        changed.forEach(persistAsset);
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

        changed.forEach(persistAsset);
      },

      deleteAssets: async (assetIds) => {
        const idsToDelete = new Set(assetIds);
        if (idsToDelete.size === 0) {
          return;
        }

        const { assets, selectedAssetIds } = get();
        const toRemove = assets.filter((asset) => idsToDelete.has(asset.id));
        const remaining = assets.filter((asset) => !idsToDelete.has(asset.id));

        cancelPendingPersists(idsToDelete);
        revokeAssetUrls(toRemove);

        await Promise.allSettled(Array.from(idsToDelete, (id) => deleteAsset(id)));

        emit("assets:deleted", idsToDelete);

        set({
          assets: remaining,
          selectedAssetIds: selectedAssetIds.filter((id) => !idsToDelete.has(id)),
        });
      },

      resetProject: async () => {
        await flushPendingPersists();
        revokeAssetUrls(get().assets);
        await clearAssets();
        await clearChatSessions();
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

