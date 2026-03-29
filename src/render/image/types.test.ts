import { describe, expect, it } from "vitest";
import { createDefaultCanvasImageRenderState } from "./stateCompiler";
import {
  createImageRenderDocument,
  resolveImageRenderEffectsForPlacement,
  type ImageRenderDocument,
} from "./types";

const getAsciiEffect = <T extends { effects: readonly { type: string }[] }>(
  document: T
): Extract<T["effects"][number], { type: "ascii" }> => {
  const effect = document.effects.find(
    (candidate): candidate is Extract<T["effects"][number], { type: "ascii" }> =>
      candidate.type === "ascii"
  );
  if (!effect) {
    throw new Error("Missing ascii effect.");
  }
  return effect;
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
  effects: [
    {
      id: "ascii-1",
      type: "ascii",
      enabled: true,
      placement: "style",
      analysisSource: "style",
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

  it("changes the revision key when semantic effect data changes", () => {
    const first = createImageRenderDocument(createDocumentInput());
    const base = createDocumentInput();
    const asciiEffect = getAsciiEffect(base);
    const second = createImageRenderDocument({
      ...base,
      effects: [
        {
          ...asciiEffect,
          params: {
            ...asciiEffect.params,
            contrast: 1.4,
          },
        },
        base.effects[1]!,
      ],
    });

    expect(first.revisionKey).not.toBe(second.revisionKey);
  });

  it("resolves enabled effects for a placement in stable order", () => {
    const base = createDocumentInput();
    const document = createImageRenderDocument({
      ...base,
      effects: [
        {
          ...base.effects[0]!,
          placement: "develop",
        },
        {
          ...base.effects[1]!,
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

    expect(
      resolveImageRenderEffectsForPlacement(document.effects, "develop").map((effect) => effect.id)
    ).toEqual(["ascii-1"]);
    expect(resolveImageRenderEffectsForPlacement(document.effects, "style")).toEqual([]);
    expect(
      resolveImageRenderEffectsForPlacement(document.effects, "finalize").map((effect) => effect.id)
    ).toEqual(["filter-1"]);
  });
});
