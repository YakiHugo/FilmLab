import {
  createCanvasImageRenderContext,
  type BoardPreviewPriority,
} from "@/features/canvas/boardImageRendering";
import { resolveReferencedTextureAssetIds } from "@/features/editor/renderDependencies";
import { ensureAssetLayers } from "@/lib/editorLayers";
import { selectionIdsEqual } from "@/features/canvas/selectionModel";
import type { CanvasImageRenderStateV1 } from "@/render/image";
import type { Asset, CanvasImageElement, CanvasWorkbench } from "@/types";

export type CanvasPreviewRenderStatus =
  | "idle"
  | "queued"
  | "rendering"
  | "ready"
  | "error";

export interface CanvasPreviewEntry {
  errorMessage: string | null;
  lastRequestedAt: number;
  previewCacheKey: string | null;
  previewSource: HTMLCanvasElement | null;
  previewVersion: number;
  renderStatus: CanvasPreviewRenderStatus;
  retained: boolean;
}

export interface CanvasRuntimeScopeInput {
  assetById: Map<string, Asset>;
  viewportScale: number;
  workbench: CanvasWorkbench | null;
  workbenchId: string | null;
}

export interface CanvasRuntimeState {
  draftRenderStateByElementId: Record<string, CanvasImageRenderStateV1 | undefined>;
  previewEntries: Record<string, CanvasPreviewEntry | undefined>;
  selectionPreviewElementIds: string[] | null;
}

export interface ResolvedPreviewTaskInput {
  asset: Asset;
  assetById: Map<string, Asset>;
  cacheKey: string;
  dependencyAssetIds: string[];
  draftRenderState: CanvasImageRenderStateV1 | undefined;
  element: CanvasImageElement;
  priority: BoardPreviewPriority;
  viewportScale: number;
}

export interface CanvasRuntimeDisposePlan {
  draftRenderStateElementIds: string[];
  hasSelectionPreview: boolean;
  previewSources: HTMLCanvasElement[];
}

export interface CreateCanvasRuntimeScopeInputOptions {
  assets: Asset[];
  viewportScale: number;
  workbench: CanvasWorkbench | null;
  workbenchId: string | null;
}

export interface CanvasRuntimeAssetChangeSet {
  changedAssetIds: Set<string>;
  nextAssetById: Map<string, Asset>;
  nextAssetRenderFingerprintById: Map<string, string>;
  nextAssetSnapshotById: Map<string, CanvasRuntimeAssetSnapshot>;
  renderChangedAssetIds: Set<string>;
}

export interface CanvasRuntimeAssetSnapshot {
  asset: Asset;
  renderFingerprint: string;
}

export const BOARD_PREVIEW_SLOT_COUNT = 3;
export const MAX_CACHED_BOARD_PREVIEWS = 24;
export const BOARD_PREVIEW_SETTLE_DELAY_MS = 140;

export const BOARD_PREVIEW_PRIORITY_ORDER: Record<BoardPreviewPriority, number> = {
  interactive: 0,
  background: 1,
};

export const shouldRetainBoardPreview = (priority: BoardPreviewPriority) =>
  priority === "interactive";

export const createEmptyPreviewEntry = (): CanvasPreviewEntry => ({
  errorMessage: null,
  lastRequestedAt: 0,
  previewCacheKey: null,
  previewSource: null,
  previewVersion: 0,
  renderStatus: "idle",
  retained: false,
});

const hashString = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
};

const serializeRuntimeAssetRenderInput = (value: unknown) => {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
};

export const resolveCanvasRuntimeAssetRenderFingerprint = (
  asset: Asset | null | undefined
) => {
  if (!asset) {
    return "missing";
  }

  return hashString(
    [
      asset.id,
      asset.objectUrl,
      asset.contentHash ?? "",
      String(asset.size),
      asset.createdAt,
      asset.filmProfileId ?? "",
      serializeRuntimeAssetRenderInput(asset.filmProfile),
      serializeRuntimeAssetRenderInput(asset.adjustments),
      serializeRuntimeAssetRenderInput(asset.layers),
      serializeRuntimeAssetRenderInput(asset.metadata),
    ].join("|")
  );
};

export const createInitialCanvasRuntimeState = (): CanvasRuntimeState => ({
  draftRenderStateByElementId: {},
  previewEntries: {},
  selectionPreviewElementIds: null,
});

export const createAssetByIdMap = (assets: Asset[]) =>
  new Map(assets.map((asset) => [asset.id, asset]));

export const resolveCanvasPreviewDependencyAssetIds = (asset: Asset) => {
  const dependencyAssetIds = new Set<string>([asset.id]);
  for (const textureAssetId of resolveReferencedTextureAssetIds(ensureAssetLayers(asset))) {
    dependencyAssetIds.add(textureAssetId);
  }
  return Array.from(dependencyAssetIds);
};

export const createCanvasRuntimeAssetSnapshotById = (assets: Asset[]) => {
  const nextAssetSnapshotById = new Map<string, CanvasRuntimeAssetSnapshot>();
  for (const asset of assets) {
    nextAssetSnapshotById.set(asset.id, {
      asset,
      renderFingerprint: resolveCanvasRuntimeAssetRenderFingerprint(asset),
    });
  }
  return nextAssetSnapshotById;
};

export const resolveCanvasRuntimeAssetChangeSet = (
  previousAssetSnapshotById: Map<string, CanvasRuntimeAssetSnapshot>,
  nextAssets: Asset[]
): CanvasRuntimeAssetChangeSet => {
  const previousAssetRenderFingerprintById = new Map(
    Array.from(previousAssetSnapshotById.entries()).map(([assetId, snapshot]) => [
      assetId,
      snapshot.renderFingerprint,
    ])
  );
  const changedAssetIds = new Set<string>();
  const nextAssetById = new Map<string, Asset>();
  const nextAssetRenderFingerprintById = new Map<string, string>();
  const nextAssetSnapshotById = new Map<string, CanvasRuntimeAssetSnapshot>();
  const renderChangedAssetIds = new Set<string>();
  const remainingPreviousAssetIds = new Set(previousAssetSnapshotById.keys());

  for (const asset of nextAssets) {
    const previousAssetSnapshot = previousAssetSnapshotById.get(asset.id);
    if (previousAssetSnapshot?.asset === asset) {
      nextAssetSnapshotById.set(asset.id, previousAssetSnapshot);
      remainingPreviousAssetIds.delete(asset.id);
      continue;
    }

    const nextRenderFingerprint = resolveCanvasRuntimeAssetRenderFingerprint(asset);
    nextAssetSnapshotById.set(asset.id, {
      asset,
      renderFingerprint: nextRenderFingerprint,
    });
    changedAssetIds.add(asset.id);
    nextAssetById.set(asset.id, asset);
    nextAssetRenderFingerprintById.set(asset.id, nextRenderFingerprint);
    if (previousAssetRenderFingerprintById.get(asset.id) !== nextRenderFingerprint) {
      renderChangedAssetIds.add(asset.id);
    }
    previousAssetRenderFingerprintById.delete(asset.id);
    remainingPreviousAssetIds.delete(asset.id);
  }

  for (const removedAssetId of remainingPreviousAssetIds) {
    changedAssetIds.add(removedAssetId);
    renderChangedAssetIds.add(removedAssetId);
  }

  return {
    changedAssetIds,
    nextAssetById,
    nextAssetRenderFingerprintById,
    nextAssetSnapshotById,
    renderChangedAssetIds,
  };
};

export const createCanvasRuntimeScopeInput = ({
  assets,
  viewportScale,
  workbench,
  workbenchId,
}: CreateCanvasRuntimeScopeInputOptions): CanvasRuntimeScopeInput => ({
  assetById: createAssetByIdMap(assets),
  viewportScale,
  workbench,
  workbenchId,
});

export const releasePreviewSource = (source: HTMLCanvasElement | null) => {
  if (!source) {
    return;
  }
  source.width = 0;
  source.height = 0;
};

export const isEffectivelyVisible = (
  element: CanvasImageElement & Partial<{ effectiveVisible: boolean }>
) => element.effectiveVisible ?? element.visible;

const resolveCanvasImageElement = (
  workbench: CanvasWorkbench | null,
  elementId: string
): CanvasImageElement | null => {
  const element = workbench?.elements.find((candidate) => candidate.id === elementId) ?? null;
  return element?.type === "image" ? element : null;
};

export const resolvePreviewTaskInput = ({
  draftRenderStateByElementId,
  elementId,
  input,
  priority,
}: {
  draftRenderStateByElementId: Record<string, CanvasImageRenderStateV1 | undefined>;
  elementId: string;
  input: CanvasRuntimeScopeInput;
  priority: BoardPreviewPriority;
}): ResolvedPreviewTaskInput | null => {
  const element = resolveCanvasImageElement(input.workbench, elementId);
  if (!element) {
    return null;
  }

  const asset = input.assetById.get(element.assetId);
  if (!asset) {
    return null;
  }

  const draftRenderState = draftRenderStateByElementId[elementId];
  const renderContext = createCanvasImageRenderContext({
    asset,
    assetById: input.assetById,
    draftRenderState,
    element,
    priority,
    viewportScale: input.viewportScale,
  });

  return {
    asset,
    assetById: input.assetById,
    cacheKey: renderContext.cacheKey,
    dependencyAssetIds: resolveCanvasPreviewDependencyAssetIds(asset),
    draftRenderState,
    element,
    priority,
    viewportScale: input.viewportScale,
  };
};

export const selectCanvasPreviewIdsForPrune = (
  previewEntries: Record<string, CanvasPreviewEntry | undefined>,
  maxCachedBoardPreviews = MAX_CACHED_BOARD_PREVIEWS
) => {
  const removableEntries = Object.entries(previewEntries).filter(
    ([, entry]) =>
      entry &&
      !entry.retained &&
      entry.renderStatus !== "queued" &&
      entry.renderStatus !== "rendering"
  );

  if (removableEntries.length <= maxCachedBoardPreviews) {
    return [];
  }

  const newestEntriesToKeep: Array<{ elementId: string; lastRequestedAt: number }> = [];
  for (const [elementId, entry] of removableEntries) {
    const candidate = {
      elementId,
      lastRequestedAt: entry?.lastRequestedAt ?? 0,
    };

    let insertIndex = newestEntriesToKeep.findIndex(
      (current) => candidate.lastRequestedAt > current.lastRequestedAt
    );
    if (insertIndex === -1) {
      insertIndex = newestEntriesToKeep.length;
    }
    newestEntriesToKeep.splice(insertIndex, 0, candidate);
    if (newestEntriesToKeep.length > maxCachedBoardPreviews) {
      newestEntriesToKeep.pop();
    }
  }

  const keptIds = new Set(newestEntriesToKeep.map((entry) => entry.elementId));
  return removableEntries
    .map(([elementId]) => elementId)
    .filter((elementId) => !keptIds.has(elementId));
};

export const resolveCanvasRuntimeDisposePlan = (
  state: CanvasRuntimeState
): CanvasRuntimeDisposePlan => ({
  draftRenderStateElementIds: Object.keys(state.draftRenderStateByElementId),
  hasSelectionPreview: state.selectionPreviewElementIds !== null,
  previewSources: Object.values(state.previewEntries)
    .map((entry) => entry?.previewSource ?? null)
    .filter((source): source is HTMLCanvasElement => source !== null),
});

export const resolveNextSelectionPreviewElementIds = (
  currentSelectionPreviewElementIds: string[] | null,
  ids: string[] | null
) => {
  const nextSelectionPreviewElementIds = ids === null ? null : Array.from(new Set(ids));
  return selectionIdsEqual(
    currentSelectionPreviewElementIds,
    nextSelectionPreviewElementIds
  )
    ? currentSelectionPreviewElementIds
    : nextSelectionPreviewElementIds;
};
