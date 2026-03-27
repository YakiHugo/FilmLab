import { createDefaultAdjustments } from "@/lib/adjustments";
import { describe, expect, it } from "vitest";
import {
  createImageRenderDocument,
  resolveImageRenderEffectsForPlacement,
  type ImageRenderDocument,
} from "./types";

const createDocumentInput = (): Omit<ImageRenderDocument, "revisionKey"> => ({
  id: "image:test",
  source: {
    assetId: "asset-1",
    objectUrl: "blob:asset-1",
    contentHash: "hash-1",
    name: "asset-1.jpg",
    mimeType: "image/jpeg",
    width: 1200,
    height: 800,
  },
  geometry: {
    rotate: 0,
    rightAngleRotation: 0,
    perspectiveEnabled: false,
    perspectiveHorizontal: 0,
      perspectiveVertical: 0,
      vertical: 0,
      horizontal: 0,
      scale: 100,
      flipHorizontal: false,
      flipVertical: false,
      aspectRatio: "free",
      customAspectRatio: 1,
      opticsProfile: false,
      opticsCA: false,
      opticsDistortionK1: 0,
      opticsDistortionK2: 0,
      opticsCaAmount: 0,
      opticsVignette: 0,
      opticsVignetteMidpoint: 50,
    },
    develop: {
      adjustments: createDefaultAdjustments(),
    },
    masks: {
      byId: {},
      localAdjustments: [],
    },
  effects: [
    {
      id: "ascii-1",
      type: "ascii",
      enabled: true,
      placement: "afterFilm",
      analysisSource: "afterFilm",
      params: {
        renderMode: "glyph",
        preset: "standard",
        cellSize: 12,
        characterSpacing: 1,
        density: 1,
        coverage: 1,
        edgeEmphasis: 0,
        brightness: 0,
        contrast: 1,
        dither: "none",
        colorMode: "grayscale",
        foregroundOpacity: 1,
        foregroundBlendMode: "source-over",
        backgroundMode: "solid",
        backgroundBlur: 0,
        backgroundOpacity: 1,
        backgroundColor: "#000000",
        invert: false,
        gridOverlay: false,
      },
    },
    {
      id: "filter-1",
      type: "filter2d",
      enabled: true,
      placement: "afterFilm",
      params: {
        brightness: 0,
        hue: 0,
        blur: 5,
        dilate: 0,
      },
    },
  ],
  film: {
    profile: null,
  },
  output: {
    timestamp: {
      enabled: false,
      position: "bottom-right",
      size: 24,
      opacity: 100,
    },
  },
});

describe("image render types", () => {
  it("builds stable revision keys for equivalent documents", () => {
    const first = createImageRenderDocument(createDocumentInput());
    const second = createImageRenderDocument(createDocumentInput());

    expect(first.revisionKey).toBe(second.revisionKey);
  });

  it("changes the revision key when semantic effect data changes", () => {
    const first = createImageRenderDocument(createDocumentInput());
    const second = createImageRenderDocument({
      ...createDocumentInput(),
      effects: [
        {
          ...createDocumentInput().effects[0]!,
          params: {
            ...createDocumentInput().effects[0]!.params,
            contrast: 1.4,
          },
        },
        createDocumentInput().effects[1]!,
      ],
    });

    expect(first.revisionKey).not.toBe(second.revisionKey);
  });

  it("resolves enabled effects for a placement in stable order", () => {
    const document = createImageRenderDocument({
      ...createDocumentInput(),
      effects: [
        {
          ...createDocumentInput().effects[0]!,
          placement: "afterDevelop",
        },
        {
          ...createDocumentInput().effects[1]!,
          placement: "afterOutput",
        },
        {
          id: "disabled-filter",
          type: "filter2d",
          enabled: false,
          placement: "afterFilm",
          params: {
            brightness: 5,
            hue: 0,
            blur: 0,
            dilate: 0,
          },
        },
      ],
    });

    expect(resolveImageRenderEffectsForPlacement(document.effects, "afterDevelop").map((effect) => effect.id)).toEqual([
      "ascii-1",
    ]);
    expect(resolveImageRenderEffectsForPlacement(document.effects, "afterFilm").map((effect) => effect.id)).toEqual([
    ]);
    expect(resolveImageRenderEffectsForPlacement(document.effects, "afterOutput").map((effect) => effect.id)).toEqual([
      "filter-1",
    ]);
  });
});
