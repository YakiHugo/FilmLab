import { describe, expect, it } from "vitest";
import { createDefaultCanvasImageRenderState } from "./stateCompiler";
import {
  createImageRenderDocument,
  normalizeCanvasImageRenderState,
  resolveImageCarrierTransforms,
  resolveImageRenderEffectsForPlacement,
  type CarrierTransformNode,
  type ImageRenderDocument,
} from "./types";

const getAsciiCarrierTransform = <T extends { carrierTransforms: readonly { type: string }[] }>(
  document: T
): Extract<T["carrierTransforms"][number], { type: "ascii" }> => {
  const transform = document.carrierTransforms.find(
    (candidate): candidate is Extract<T["carrierTransforms"][number], { type: "ascii" }> =>
      candidate.type === "ascii"
  );
  if (!transform) {
    throw new Error("Missing ascii carrier transform.");
  }
  return transform;
};

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
  ...createDefaultCanvasImageRenderState(),
  carrierTransforms: [
    {
      id: "ascii-1",
      type: "ascii",
      enabled: true,
      analysisSource: "style",
      params: {
        renderMode: "glyph",
        preset: "standard",
        customCharset: null,
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
  ],
  effects: [
    {
      id: "filter-1",
      type: "filter2d",
      enabled: true,
      placement: "style",
      params: {
        brightness: 0,
        hue: 0,
        blur: 5,
        dilate: 0,
      },
    },
  ],
  film: {
    profileId: null,
    profile: null,
    profileOverrides: null,
  },
});

describe("image render types", () => {
  it("builds stable revision keys for equivalent documents", () => {
    const first = createImageRenderDocument(createDocumentInput());
    const second = createImageRenderDocument(createDocumentInput());

    expect(first.revisionKey).toBe(second.revisionKey);
  });

  it("changes the revision key when carrier-transform data changes", () => {
    const first = createImageRenderDocument(createDocumentInput());
    const base = createDocumentInput();
    const asciiCarrier = getAsciiCarrierTransform(base);
    const second = createImageRenderDocument({
      ...base,
      carrierTransforms: [
        {
          ...asciiCarrier,
          params: {
            ...asciiCarrier.params,
            contrast: 1.4,
          },
        },
      ],
    });

    expect(first.revisionKey).not.toBe(second.revisionKey);
  });

  it("resolves enabled carrier transforms and placement-scoped raster effects in stable order", () => {
    const base = createDocumentInput();
    const document = createImageRenderDocument({
      ...base,
      effects: [
        {
          ...base.effects[0]!,
          placement: "finalize",
        },
        {
          id: "disabled-filter",
          type: "filter2d",
          enabled: false,
          placement: "style",
          params: {
            brightness: 5,
            hue: 0,
            blur: 0,
            dilate: 0,
          },
        },
      ],
    });

    expect(resolveImageCarrierTransforms(document.carrierTransforms).map((transform) => transform.id)).toEqual([
      "ascii-1",
    ]);
    expect(resolveImageRenderEffectsForPlacement(document.effects, "style")).toEqual([]);
    expect(
      resolveImageRenderEffectsForPlacement(document.effects, "finalize").map((effect) => effect.id)
    ).toEqual(["filter-1"]);
  });

  it("normalizes legacy ascii effects into carrierTransforms and strips them from effects", () => {
    const normalized = normalizeCanvasImageRenderState({
      ...createDefaultCanvasImageRenderState(),
      effects: [
        {
          id: "legacy-ascii",
          type: "ascii",
          enabled: true,
          placement: "style",
          analysisSource: "develop",
          params: {
            renderMode: "glyph",
            preset: "blocks",
            customCharset: null,
            cellSize: 10,
            characterSpacing: 1,
            density: 1,
            coverage: 1,
            edgeEmphasis: 0,
            brightness: 0,
            contrast: 1.2,
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
        } as unknown as CarrierTransformNode,
      ] as unknown as ImageRenderDocument["effects"],
    });

    expect(normalized.carrierTransforms).toMatchObject([
      {
        id: "legacy-ascii",
        type: "ascii",
        analysisSource: "develop",
      },
    ]);
    expect(normalized.effects).toEqual([]);
  });
});
