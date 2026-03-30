import { describe, expect, it } from "vitest";
import { createDefaultCanvasImageRenderState } from "@/render/image";
import type { Asset, CanvasImageElement, CanvasWorkbench } from "@/types";
import { normalizeCanvasWorkbench } from "@/features/canvas/studioPresets";
import {
  createCanvasRuntimeAssetSnapshotById,
  resolveCanvasPreviewDependencyAssetIds,
  resolveCanvasRuntimeAssetChangeSet,
  resolveCanvasRuntimeAssetRenderFingerprint,
  resolveCanvasRuntimeDisposePlan,
  resolvePreviewTaskInput,
  selectCanvasPreviewIdsForPrune,
  type CanvasRuntimeScopeInput,
} from "./canvasPreviewRuntimeState";

const createAsset = (overrides: Partial<Asset> = {}): Asset => ({
  id: "asset-1",
  name: "asset-1.jpg",
  type: "image/jpeg",
  size: 2048,
  createdAt: "2026-03-17T00:00:00.000Z",
  objectUrl: "blob:asset-1",
  thumbnailUrl: "blob:asset-1-thumb",
  tags: [],
  importDay: "2026-03-17",
  origin: "file",
  remote: {
    status: "local_only",
    updatedAt: "2026-03-17T00:00:00.000Z",
  },
  ownerRef: {
    userId: "user-1",
  },
  ...overrides,
});

const createImageElement = (): CanvasImageElement => ({
  assetId: "asset-1",
  height: 180,
  id: "image-1",
  locked: false,
  opacity: 1,
  parentId: null,
  rotation: 0,
  transform: {
    height: 180,
    rotation: 0,
    width: 320,
    x: 24,
    y: 32,
  },
  type: "image",
  visible: true,
  width: 320,
  x: 24,
  y: 32,
  renderState: createDefaultCanvasImageRenderState(),
});

const createWorkbench = (element: CanvasImageElement): CanvasWorkbench =>
  normalizeCanvasWorkbench({
    backgroundColor: "#000000",
    createdAt: "2026-03-17T00:00:00.000Z",
    guides: {
      showCenter: false,
      showSafeArea: false,
      showThirds: false,
    },
    height: 800,
    id: "doc-1",
    name: "Workbench",
    nodes: {
      [element.id]: element,
    },
    ownerRef: {
      userId: "user-1",
    },
    presetId: "custom",
    rootIds: [element.id],
    safeArea: {
      bottom: 0,
      left: 0,
      right: 0,
      top: 0,
    },
    slices: [],
    updatedAt: "2026-03-17T00:00:00.000Z",
    version: 5,
    width: 1200,
  });

const createScopeInput = (): CanvasRuntimeScopeInput => {
  const asset = createAsset();
  return {
    assetById: new Map([[asset.id, asset]]),
    viewportScale: 1.25,
    workbench: createWorkbench(createImageElement()),
    workbenchId: "doc-1",
  };
};

describe("canvasPreviewRuntimeState", () => {
  it("resolves preview task input from explicit runtime scope input", () => {
    const input = createScopeInput();
    const nextDraftRenderState = createDefaultCanvasImageRenderState();
    nextDraftRenderState.effects.push({
      id: "filter2d-preview",
      type: "filter2d",
      enabled: true,
      placement: "finalize",
      params: {
        brightness: 12,
        hue: 0,
        blur: 0,
        dilate: 0,
      },
    });

    const taskInput = resolvePreviewTaskInput({
      draftRenderStateByElementId: {
        "image-1": nextDraftRenderState,
      },
      elementId: "image-1",
      input,
      priority: "interactive",
    });

    expect(taskInput).not.toBeNull();
    expect(taskInput?.asset.id).toBe("asset-1");
    expect(taskInput?.element.id).toBe("image-1");
    expect(taskInput?.draftRenderState?.effects.find((effect) => effect.type === "filter2d")).toMatchObject({
      params: {
        brightness: 12,
      },
    });
    expect(taskInput?.viewportScale).toBe(1.25);
    expect(taskInput?.cacheKey).toContain("variant:interactive");
    expect(taskInput?.dependencyAssetIds).toEqual(["asset-1"]);
  });

  it("selects the oldest non-retained ready previews for pruning", () => {
    expect(
      selectCanvasPreviewIdsForPrune({
        "image-1": {
          errorMessage: null,
          lastRequestedAt: 1,
          previewCacheKey: "cache-1",
          previewSource: null,
          previewVersion: 1,
          renderStatus: "ready",
          retained: false,
        },
        "image-2": {
          errorMessage: null,
          lastRequestedAt: 2,
          previewCacheKey: "cache-2",
          previewSource: null,
          previewVersion: 2,
          renderStatus: "rendering",
          retained: false,
        },
        "image-3": {
          errorMessage: null,
          lastRequestedAt: 3,
          previewCacheKey: "cache-3",
          previewSource: null,
          previewVersion: 3,
          renderStatus: "ready",
          retained: false,
        },
        "image-4": {
          errorMessage: null,
          lastRequestedAt: 4,
          previewCacheKey: "cache-4",
          previewSource: null,
          previewVersion: 4,
          renderStatus: "ready",
          retained: true,
        },
      }, 1)
    ).toEqual(["image-1"]);
  });

  it("collects runtime resources that must be released on scope dispose", () => {
    const firstCanvas = { height: 80, width: 120 } as HTMLCanvasElement;
    const secondCanvas = { height: 60, width: 100 } as HTMLCanvasElement;

    const disposePlan = resolveCanvasRuntimeDisposePlan({
      draftRenderStateByElementId: {
        "image-1": createDefaultCanvasImageRenderState(),
      },
      previewEntries: {
        "image-1": {
          errorMessage: null,
          lastRequestedAt: 1,
          previewCacheKey: "cache-1",
          previewSource: firstCanvas,
          previewVersion: 1,
          renderStatus: "ready",
          retained: false,
        },
        "image-2": {
          errorMessage: null,
          lastRequestedAt: 2,
          previewCacheKey: "cache-2",
          previewSource: secondCanvas,
          previewVersion: 2,
          renderStatus: "queued",
          retained: false,
        },
      },
      selectionPreviewElementIds: ["image-1"],
    });

    expect(disposePlan.draftRenderStateElementIds).toEqual(["image-1"]);
    expect(disposePlan.hasSelectionPreview).toBe(true);
    expect(disposePlan.previewSources).toEqual([firstCanvas, secondCanvas]);
  });

  it("tracks only the source asset for preview invalidation", () => {
    const asset = createAsset();

    expect(resolveCanvasPreviewDependencyAssetIds(asset)).toEqual(["asset-1"]);
  });

  it("computes changed asset ids and applies them back into the runtime asset map", () => {
    const unchangedAsset = createAsset({ id: "asset-1" });
    const replacedAsset = createAsset({ id: "asset-2", objectUrl: "blob:asset-2:v1" });
    const nextReplacedAsset = {
      ...replacedAsset,
      objectUrl: "blob:asset-2:v2",
    };
    const addedAsset = createAsset({ id: "asset-3", objectUrl: "blob:asset-3" });

    const changeSet = resolveCanvasRuntimeAssetChangeSet(
      createCanvasRuntimeAssetSnapshotById([unchangedAsset, replacedAsset]),
      [unchangedAsset, nextReplacedAsset, addedAsset]
    );

    expect(Array.from(changeSet.changedAssetIds).sort()).toEqual(["asset-2", "asset-3"]);
    expect(Array.from(changeSet.renderChangedAssetIds).sort()).toEqual([
      "asset-2",
      "asset-3",
    ]);
    expect(changeSet.nextAssetSnapshotById.get("asset-1")?.asset).toBe(unchangedAsset);
    expect(changeSet.nextAssetSnapshotById.get("asset-2")?.asset).toBe(nextReplacedAsset);
    expect(changeSet.nextAssetSnapshotById.get("asset-3")?.asset).toBe(addedAsset);
  });

  it("ignores non-render asset updates when resolving preview invalidation", () => {
    const previousAsset = createAsset({ id: "asset-1", tags: ["initial"] });
    const nextAsset = {
      ...previousAsset,
      tags: ["next"],
      remote: {
        status: "synced" as const,
        updatedAt: "2026-03-18T00:00:00.000Z",
      },
    };

    const changeSet = resolveCanvasRuntimeAssetChangeSet(
      createCanvasRuntimeAssetSnapshotById([previousAsset]),
      [nextAsset]
    );

    expect(Array.from(changeSet.changedAssetIds)).toEqual(["asset-1"]);
    expect(Array.from(changeSet.renderChangedAssetIds)).toEqual([]);
    expect(changeSet.nextAssetRenderFingerprintById.get("asset-1")).toBe(
      resolveCanvasRuntimeAssetRenderFingerprint(nextAsset)
    );
    expect(changeSet.nextAssetSnapshotById.get("asset-1")?.asset).toBe(nextAsset);
    expect(changeSet.nextAssetSnapshotById.get("asset-1")?.renderFingerprint).toBe(
      resolveCanvasRuntimeAssetRenderFingerprint(nextAsset)
    );
  });
});
