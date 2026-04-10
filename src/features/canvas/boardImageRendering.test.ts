import { describe, expect, it } from "vitest";
import { createDefaultCanvasImageRenderState } from "@/render/image";
import type { Asset, CanvasImageElement } from "@/types";
import {
  createCanvasImageRenderContext,
  resolveCanvasImagePreviewTargetSize,
} from "./boardImageRendering";
import { resolveCanvasImageRenderState } from "./imageRenderState";

const createAsset = (overrides?: Partial<Asset>): Asset => ({
  id: overrides?.id ?? "asset-1",
  name: overrides?.name ?? "asset-1.jpg",
  type: overrides?.type ?? "image/jpeg",
  size: overrides?.size ?? 2048,
  createdAt: overrides?.createdAt ?? "2026-03-17T00:00:00.000Z",
  objectUrl: overrides?.objectUrl ?? "blob:asset-1",
  thumbnailUrl: overrides?.thumbnailUrl ?? "blob:asset-1-thumb",
  tags: overrides?.tags ?? [],
  importDay: overrides?.importDay ?? "2026-03-17",
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
  renderState: overrides?.renderState ?? createDefaultCanvasImageRenderState(),
});

describe("boardImageRendering", () => {
  it("keeps interactive and settled previews on distinct cache variants", () => {
    const asset = createAsset();
    const element = createElement({
      width: 2000,
      height: 1500,
    });

    const interactive = createCanvasImageRenderContext({
      asset,
      element,
      priority: "interactive",
    });
    const background = createCanvasImageRenderContext({
      asset,
      element,
      priority: "background",
    });

    expect(background.targetSize.width).toBeGreaterThanOrEqual(interactive.targetSize.width);
    expect(background.targetSize.height).toBeGreaterThanOrEqual(interactive.targetSize.height);
    expect(interactive.cacheKey).not.toBe(background.cacheKey);
  });

  it("scales preview targets with the current viewport zoom bucket", () => {
    const asset = createAsset();
    const element = createElement({
      width: 800,
      height: 600,
    });

    const zoomedOut = createCanvasImageRenderContext({
      asset,
      element,
      priority: "background",
      viewportScale: 0.5,
    });
    const zoomedIn = createCanvasImageRenderContext({
      asset,
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

  it("folds draft render state and per-element film profiles into the render context", () => {
    const asset = createAsset();
    const elementRenderState = createDefaultCanvasImageRenderState();
    elementRenderState.film.profileId = "film-portrait-soft-v1";
    const draftRenderState = createDefaultCanvasImageRenderState();
    draftRenderState.develop.tone.exposure = 24;
    draftRenderState.film.profileId = elementRenderState.film.profileId;
    const element = createElement({
      renderState: elementRenderState,
    });

    const context = createCanvasImageRenderContext({
      asset,
      draftRenderState,
      element,
      priority: "interactive",
    });

    expect(
      resolveCanvasImageRenderState(element, draftRenderState).develop.tone.exposure
    ).toBe(24);
    expect(context.renderState.develop.tone.exposure).toBe(24);
    expect(context.filmProfile?.id).toBe("film-portrait-soft-v1");
  });

  it("resolves persisted renderState without requiring runtime asset availability", () => {
    const renderState = createDefaultCanvasImageRenderState();
    renderState.develop.tone.exposure = 11;
    const element = {
      ...createElement({
        renderState,
      }),
    };

    expect(resolveCanvasImageRenderState(element)).toBe(renderState);
  });

  it("invalidates preview cache keys when the source asset content changes", () => {
    const element = createElement();
    const assetV1 = createAsset({
      objectUrl: "blob:asset-1-v1",
      contentHash: "asset-v1",
    });
    const assetV2 = createAsset({
      objectUrl: "blob:asset-1-v2",
      contentHash: "asset-v2",
    });

    const first = createCanvasImageRenderContext({
      asset: assetV1,
      element,
      priority: "interactive",
    });
    const second = createCanvasImageRenderContext({
      asset: assetV2,
      element,
      priority: "interactive",
    });

    expect(first.imageDocument.revisionKey).not.toBe(second.imageDocument.revisionKey);
    expect(first.cacheKey).not.toBe(second.cacheKey);
  });

  it("invalidates preview cache keys when carrierTransforms change", () => {
    const asset = createAsset();
    const element = createElement();
    const draftV1 = createDefaultCanvasImageRenderState();
    const draftV2 = createDefaultCanvasImageRenderState();
    draftV2.carrierTransforms.push({
      id: "ascii-primary",
      type: "ascii",
      enabled: true,
      analysisSource: "style",
      params: {
        renderMode: "glyph",
        preset: "blocks",
        cellSize: 12,
        characterSpacing: 1,
        density: 1,
        coverage: 1,
        edgeEmphasis: 0,
        brightness: 0,
        contrast: 1.5,
        dither: "none",
        colorMode: "grayscale",
        foregroundOpacity: 1,
        foregroundBlendMode: "source-over",
        backgroundMode: "none",
        backgroundBlur: 0,
        backgroundOpacity: 0,
        backgroundColor: null,
        invert: false,
        gridOverlay: false,
      },
    });

    const first = createCanvasImageRenderContext({
      asset,
      draftRenderState: draftV1,
      element,
      priority: "interactive",
    });
    const second = createCanvasImageRenderContext({
      asset,
      draftRenderState: draftV2,
      element,
      priority: "interactive",
    });

    expect(first.imageDocument.revisionKey).not.toBe(second.imageDocument.revisionKey);
    expect(first.cacheKey).not.toBe(second.cacheKey);
  });
});
