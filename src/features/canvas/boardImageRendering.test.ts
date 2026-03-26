import { describe, expect, it } from "vitest";
import { createDefaultAdjustments } from "@/lib/adjustments";
import type { Asset, CanvasImageElement } from "@/types";
import {
  createCanvasImageRenderContext,
  resolveCanvasImageAdjustments,
  resolveCanvasImagePreviewTargetSize,
} from "./boardImageRendering";

const createAsset = (overrides?: Partial<Asset>): Asset => ({
  id: overrides?.id ?? "asset-1",
  name: overrides?.name ?? "asset-1.jpg",
  type: overrides?.type ?? "image/jpeg",
  size: overrides?.size ?? 2048,
  createdAt: overrides?.createdAt ?? "2026-03-17T00:00:00.000Z",
  objectUrl: overrides?.objectUrl ?? "blob:asset-1",
  thumbnailUrl: overrides?.thumbnailUrl ?? "blob:asset-1-thumb",
  adjustments: overrides?.adjustments ?? createDefaultAdjustments(),
  layers: overrides?.layers ?? [],
  tags: overrides?.tags ?? [],
  importDay: overrides?.importDay ?? "2026-03-17",
  group: overrides?.group ?? "2026-03-17",
  origin: overrides?.origin ?? "file",
  remote: overrides?.remote ?? {
    status: "local_only",
    updatedAt: "2026-03-17T00:00:00.000Z",
  },
  ownerRef: overrides?.ownerRef ?? {
    userId: "user-1",
  },
  ...overrides,
});

const createElement = (overrides?: Partial<CanvasImageElement>): CanvasImageElement => ({
  id: overrides?.id ?? "element-1",
  type: "image",
  parentId: overrides?.parentId ?? null,
  assetId: overrides?.assetId ?? "asset-1",
  x: overrides?.x ?? 10,
  y: overrides?.y ?? 20,
  width: overrides?.width ?? 400,
  height: overrides?.height ?? 300,
  rotation: overrides?.rotation ?? 0,
  transform: overrides?.transform ?? {
    x: overrides?.x ?? 10,
    y: overrides?.y ?? 20,
    width: overrides?.width ?? 400,
    height: overrides?.height ?? 300,
    rotation: overrides?.rotation ?? 0,
  },
  opacity: overrides?.opacity ?? 1,
  locked: overrides?.locked ?? false,
  visible: overrides?.visible ?? true,
  zIndex: overrides?.zIndex ?? 1,
  adjustments: overrides?.adjustments,
  filmProfileId: overrides?.filmProfileId,
});

describe("boardImageRendering", () => {
  it("keeps interactive and settled previews on distinct cache variants", () => {
    const asset = createAsset();
    const assetById = new Map([[asset.id, asset]]);
    const element = createElement({
      width: 2000,
      height: 1500,
    });

    const interactive = createCanvasImageRenderContext({
      asset,
      assetById,
      element,
      priority: "interactive",
    });
    const background = createCanvasImageRenderContext({
      asset,
      assetById,
      element,
      priority: "background",
    });

    expect(background.targetSize.width).toBeGreaterThanOrEqual(interactive.targetSize.width);
    expect(background.targetSize.height).toBeGreaterThanOrEqual(interactive.targetSize.height);
    expect(interactive.cacheKey).not.toBe(background.cacheKey);
  });

  it("scales preview targets with the current viewport zoom bucket", () => {
    const asset = createAsset();
    const assetById = new Map([[asset.id, asset]]);
    const element = createElement({
      width: 800,
      height: 600,
    });

    const zoomedOut = createCanvasImageRenderContext({
      asset,
      assetById,
      element,
      priority: "background",
      viewportScale: 0.5,
    });
    const zoomedIn = createCanvasImageRenderContext({
      asset,
      assetById,
      element,
      priority: "background",
      viewportScale: 2,
    });

    expect(zoomedIn.targetSize.width).toBeGreaterThan(zoomedOut.targetSize.width);
    expect(zoomedIn.targetSize.height).toBeGreaterThan(zoomedOut.targetSize.height);
    expect(zoomedIn.cacheKey).not.toBe(zoomedOut.cacheKey);
  });

  it("preserves the element aspect ratio when resolving preview target sizes", () => {
    const targetSize = resolveCanvasImagePreviewTargetSize(
      createElement({
        width: 401,
        height: 267,
      }),
      "background",
      1
    );

    expect(targetSize.width / targetSize.height).toBeCloseTo(401 / 267, 2);
  });

  it("folds draft adjustments and per-element film profiles into the render context", () => {
    const asset = createAsset({
      adjustments: {
        ...createDefaultAdjustments(),
        exposure: 2,
      },
    });
    const assetById = new Map([[asset.id, asset]]);
    const element = createElement({
      filmProfileId: "film-portrait-soft-v1",
    });
    const draftAdjustments = {
      ...createDefaultAdjustments(),
      exposure: 24,
    };

    const context = createCanvasImageRenderContext({
      asset,
      assetById,
      draftAdjustments,
      element,
      priority: "interactive",
    });

    expect(resolveCanvasImageAdjustments(element, asset, draftAdjustments).exposure).toBe(24);
    expect(context.adjustments.exposure).toBe(24);
    expect(context.filmProfile?.id).toBe("film-portrait-soft-v1");
  });
});
