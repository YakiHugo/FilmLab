import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { presets } from "@/data/presets";
import { createDefaultAdjustments, normalizeAdjustments } from "@/lib/adjustments";
import { prepareAssetPayload } from "@/lib/assetMetadata";
import { emit } from "@/lib/storeEvents";
import type { Asset, AssetUpdate, Project } from "@/types";
import {
  clearAssets,
  deleteAsset,
  loadAssets,
  loadProject,
  saveAsset,
  saveProject,
  type StoredAsset,
} from "@/lib/db";
import { loadCustomPresets } from "@/features/editor/presetUtils";

/** Look up a preset by ID from both built-in and custom presets. */
const findPresetById = (presetId: string) => {
  const builtIn = presets.find((p) => p.id === presetId);
  if (builtIn) return builtIn;
  // Fall back to custom presets stored in localStorage
  const custom = loadCustomPresets();
  return custom.find((p) => p.id === presetId);
};

/**
 * Shared helper: apply a preset (and optional intensity) to a subset of assets.
 * Returns the full next-assets array and the list of changed assets for persistence.
 */
const applyPresetToAssets = (
  assets: Asset[],
  shouldUpdate: (asset: Asset) => boolean,
  presetId: string,
  intensity?: number
): { nextAssets: Asset[]; changed: Asset[] } => {
  const selectedPreset = findPresetById(presetId);
  const changed: Asset[] = [];
  const nextAssets = assets.map((asset) => {
    if (!shouldUpdate(asset)) return asset;
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

export interface AddAssetsResult {
  added: number;
  failed: number;
  addedAssetIds: string[];
  errors?: string[];
}

interface ProjectState {
  project: Project | null;
  assets: Asset[];
  presets: typeof presets;
  isLoading: boolean;
  isImporting: boolean;
  importProgress: { current: number; total: number } | null;
  selectedAssetIds: string[];
  init: () => Promise<void>;
  addAssets: (files: File[]) => Promise<AddAssetsResult>;
  applyPresetToGroup: (group: string, presetId: string, intensity: number) => void;
  updatePresetForGroup: (group: string, presetId: string) => void;
  updateIntensityForGroup: (group: string, intensity: number) => void;
  applyPresetToSelection: (assetIds: string[], presetId: string, intensity: number) => void;
  updateAsset: (assetId: string, update: AssetUpdate) => void;
  updateAssetOnly: (assetId: string, update: AssetUpdate) => void;
  setSelectedAssetIds: (assetIds: string[]) => void;
  addToSelection: (assetIds: string[]) => void;
  toggleAssetSelection: (assetId: string) => void;
  removeFromSelection: (assetIds: string[]) => void;
  clearAssetSelection: () => void;
  deleteAssets: (assetIds: string[]) => Promise<void>;
  resetProject: () => Promise<void>;
}

const defaultProject = (): Project => {
  const now = new Date().toISOString();
  return {
    id: "default-project",
    name: "FilmLab 项目",
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

const toStoredAsset = (asset: Asset): StoredAsset | null => {
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
    group: asset.group,
    thumbnailBlob: asset.thumbnailBlob,
    metadata: asset.metadata,
    adjustments: asset.adjustments ? normalizeAdjustments(asset.adjustments) : undefined,
    aiRecommendation: asset.aiRecommendation,
  };
};

const normalizeAssetUpdate = (update: AssetUpdate): AssetUpdate => {
  if (!update.adjustments) {
    return update;
  }
  return {
    ...update,
    adjustments: normalizeAdjustments(update.adjustments),
  };
};

const PERSIST_DEBOUNCE_MS = 300;
const pendingPersists = new Map<
  string,
  { timer: ReturnType<typeof setTimeout>; payload: StoredAsset }
>();

const flushPendingPersists = async () => {
  const entries = Array.from(pendingPersists.values());
  pendingPersists.clear();
  for (const { timer } of entries) {
    clearTimeout(timer);
  }
  await Promise.allSettled(entries.map(({ payload }) => saveAsset(payload)));
};

const persistAsset = (asset: Asset) => {
  const payload = toStoredAsset(asset);
  if (!payload) {
    return;
  }

  // Cancel any pending write for this asset so only the latest state is persisted
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

// Flush pending writes before the page unloads to prevent data loss
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    // Synchronously clear timers and fire writes (best-effort before tab closes)
    for (const { timer, payload } of pendingPersists.values()) {
      clearTimeout(timer);
      void saveAsset(payload).catch(() => {});
    }
    pendingPersists.clear();
  });
}

export const useProjectStore = create<ProjectState>()(
  devtools(
    (set, get) => ({
      project: null,
      assets: [],
      presets,
      isLoading: true,
      isImporting: false,
      importProgress: null,
      selectedAssetIds: [],
      init: async () => {
        set({ isLoading: true });
        const storedProject = await loadProject();
        const project = storedProject ?? defaultProject();
        if (!storedProject) {
          await saveProject(project);
        }

        const storedAssets = await loadAssets();
        const assets: Asset[] = storedAssets.map((asset, index) => {
          const objectUrl = URL.createObjectURL(asset.blob);
          const thumbnailUrl = asset.thumbnailBlob
            ? URL.createObjectURL(asset.thumbnailBlob)
            : objectUrl;
          const fallbackGroup = `Group ${(index % 4) + 1}`;
          const group = asset.group ?? fallbackGroup;
          return {
            id: asset.id,
            name: asset.name,
            type: asset.type,
            size: asset.size,
            createdAt: asset.createdAt,
            objectUrl,
            thumbnailUrl,
            presetId: asset.presetId,
            intensity: asset.intensity,
            filmProfileId: asset.filmProfileId,
            filmOverrides: asset.filmOverrides,
            filmProfile: asset.filmProfile,
            group,
            blob: asset.blob,
            thumbnailBlob: asset.thumbnailBlob,
            metadata: asset.metadata,
            adjustments: normalizeAdjustments(asset.adjustments ?? createDefaultAdjustments()),
            aiRecommendation: asset.aiRecommendation,
          };
        });

        // Atomically read previous state and update in a single set() call
        // to avoid race conditions between get() calls.
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
      },
      addAssets: async (files: File[]) => {
        if (files.length === 0) {
          return {
            added: 0,
            failed: 0,
            addedAssetIds: [],
          };
        }
        set({ isImporting: true, importProgress: { current: 0, total: files.length } });
        try {
          const { assets, project } = get();
          const timestamp = new Date().toISOString();
          const newAssets: Asset[] = [];
          let failedCount = 0;
          let processedCount = 0;
          const errors: string[] = [];

          // Process files with limited concurrency to avoid overwhelming the browser
          const CONCURRENCY = 4;
          let nextIndex = 0;

          const processFile = async () => {
            while (nextIndex < files.length) {
              const fileIndex = nextIndex++;
              const file = files[fileIndex]!;
              try {
                const id = `${file.name}-${file.lastModified}-${Math.random().toString(16).slice(2)}`;
                const group = `Group ${((assets.length + fileIndex) % 4) + 1}`;
                const fileBlob = file.slice(0, file.size, file.type);
                const { metadata, thumbnailBlob } = await prepareAssetPayload(fileBlob);
                const objectUrl = URL.createObjectURL(fileBlob);
                const thumbnailUrl = thumbnailBlob ? URL.createObjectURL(thumbnailBlob) : objectUrl;

                const asset: Asset = {
                  id,
                  name: file.name,
                  type: file.type,
                  size: file.size,
                  createdAt: timestamp,
                  objectUrl,
                  thumbnailUrl,
                  presetId: presets[0]?.id,
                  intensity: presets[0]?.intensity,
                  filmProfileId: presets[0]?.filmProfileId,
                  filmProfile: presets[0]?.filmProfile,
                  group,
                  blob: fileBlob,
                  thumbnailBlob,
                  metadata,
                  adjustments: createDefaultAdjustments(),
                };

                const payload = toStoredAsset(asset);
                if (payload) {
                  await saveAsset(payload);
                }
                newAssets.push(asset);
              } catch (error) {
                console.warn("Failed to import asset", file.name, error);
                failedCount += 1;
                const detail = error instanceof Error ? error.message : "Unknown error";
                errors.push(`${file.name}: ${detail}`);
              }
              processedCount += 1;
              set({ importProgress: { current: processedCount, total: files.length } });
            }
          };

          // Launch up to CONCURRENCY workers
          await Promise.all(
            Array.from({ length: Math.min(CONCURRENCY, files.length) }, () => processFile())
          );
          if (newAssets.length === 0) {
            return {
              added: 0,
              failed: failedCount || files.length,
              addedAssetIds: [],
              errors,
            };
          }

          const updatedProject = project ? { ...project, updatedAt: timestamp } : defaultProject();
          try {
            await saveProject(updatedProject);
          } catch (error) {
            console.warn("Failed to persist project after import", error);
          }
          set((state) => ({
            project: updatedProject,
            assets: [...state.assets, ...newAssets],
          }));
          return {
            added: newAssets.length,
            failed: failedCount,
            addedAssetIds: newAssets.map((asset) => asset.id),
            errors,
          };
        } finally {
          set({ isImporting: false, importProgress: null });
        }
      },
      applyPresetToGroup: (group, presetId, intensity) => {
        let changed: Asset[] = [];
        set((state) => {
          const result = applyPresetToAssets(
            state.assets,
            (a) => a.group === group,
            presetId,
            intensity
          );
          changed = result.changed;
          return { assets: result.nextAssets };
        });
        changed.forEach(persistAsset);
      },
      updatePresetForGroup: (group, presetId) => {
        let changed: Asset[] = [];
        set((state) => {
          const result = applyPresetToAssets(
            state.assets,
            (a) => a.group === group,
            presetId
          );
          changed = result.changed;
          return { assets: result.nextAssets };
        });
        changed.forEach(persistAsset);
      },
      updateIntensityForGroup: (group, intensity) => {
        const changed: Asset[] = [];
        set((state) => {
          const nextAssets = state.assets.map((asset) => {
            if (asset.group !== group) return asset;
            const updated = { ...asset, intensity };
            changed.push(updated);
            return updated;
          });
          return { assets: nextAssets };
        });
        changed.forEach(persistAsset);
      },
      applyPresetToSelection: (assetIds, presetId, intensity) => {
        const selectedSet = new Set(assetIds);
        let changed: Asset[] = [];
        set((state) => {
          const result = applyPresetToAssets(
            state.assets,
            (a) => selectedSet.has(a.id),
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
          asset.id === assetId ? { ...asset, ...normalizedUpdate } : asset
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
          asset.id === assetId ? { ...asset, ...normalizedUpdate } : asset
        );
        set({ assets: nextAssets });
      },
      setSelectedAssetIds: (assetIds) => {
        const unique = Array.from(new Set(assetIds));
        set({ selectedAssetIds: unique });
      },
      addToSelection: (assetIds) => {
        const unique = new Set(get().selectedAssetIds);
        assetIds.forEach((id) => unique.add(id));
        set({ selectedAssetIds: Array.from(unique) });
      },
      toggleAssetSelection: (assetId) => {
        const current = new Set(get().selectedAssetIds);
        if (current.has(assetId)) {
          current.delete(assetId);
        } else {
          current.add(assetId);
        }
        set({ selectedAssetIds: Array.from(current) });
      },
      removeFromSelection: (assetIds) => {
        const current = new Set(get().selectedAssetIds);
        assetIds.forEach((id) => current.delete(id));
        set({ selectedAssetIds: Array.from(current) });
      },
      clearAssetSelection: () => {
        set({ selectedAssetIds: [] });
      },
      deleteAssets: async (assetIds) => {
        const idsToDelete = new Set(assetIds);
        const { assets, selectedAssetIds } = get();
        const toRemove = assets.filter((a) => idsToDelete.has(a.id));
        const remaining = assets.filter((a) => !idsToDelete.has(a.id));

        // Cancel pending persists for deleted assets
        for (const id of idsToDelete) {
          const pending = pendingPersists.get(id);
          if (pending) {
            clearTimeout(pending.timer);
            pendingPersists.delete(id);
          }
        }

        // Revoke object URLs
        revokeAssetUrls(toRemove);

        // Remove from IndexedDB
        await Promise.allSettled(Array.from(idsToDelete, (id) => deleteAsset(id)));

        // Notify listeners (editorStore clears history in response)
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
        const project = defaultProject();
        await saveProject(project);
        set({ project, assets: [], selectedAssetIds: [] });

        // Notify listeners (editorStore clears all history in response)
        emit("project:reset");
      },
    }),
    { name: "ProjectStore", enabled: process.env.NODE_ENV === "development" }
  )
);

// ── Fine-grained selectors ──────────────────────────────────────────
// Stable references avoid unnecessary re-renders when used with
// `useProjectStore(selectAssets)` instead of inline arrow functions.

export const selectAssets = (s: ProjectState) => s.assets;
export const selectProject = (s: ProjectState) => s.project;
export const selectIsLoading = (s: ProjectState) => s.isLoading;
export const selectIsImporting = (s: ProjectState) => s.isImporting;
export const selectSelectedAssetIds = (s: ProjectState) => s.selectedAssetIds;
export const selectPresets = (s: ProjectState) => s.presets;
