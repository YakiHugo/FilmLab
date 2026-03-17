import { describe, expect, it } from "vitest";
import { createDefaultAdjustments } from "@/lib/adjustments";
import type { Asset, CanvasImageElement } from "@/types";
import {
  createCanvasImageRenderContext,
  resolveCanvasImageAdjustments,
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
  assetId: overrides?.assetId ?? "asset-1",
  x: overrides?.x ?? 10,
  y: overrides?.y ?? 20,
  width: overrides?.width ?? 400,
  height: overrides?.height ?? 300,
  rotation: overrides?.rotation ?? 0,
  opacity: overrides?.opacity ?? 1,
  locked: overrides?.locked ?? false,
  visible: overrides?.visible ?? true,
  zIndex: overrides?.zIndex ?? 1,
  adjustments: overrides?.adjustments,
  filmProfileId: overrides?.filmProfileId,
});

describe("boardImageRendering", () => {
  it("scales interactive previews above background previews while keeping a stable cache key", () => {
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

    expect(interactive.targetSize.width).toBeGreaterThan(background.targetSize.width);
    expect(interactive.targetSize.height).toBeGreaterThan(background.targetSize.height);
    expect(interactive.cacheKey).not.toBe(background.cacheKey);
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
