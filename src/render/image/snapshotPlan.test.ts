import { describe, expect, it } from "vitest";
import { createImageRenderSnapshotPlan, assertSupportedImageRenderSnapshotPlan } from "./snapshotPlan";
import type { CarrierTransformNode, ImageEffectNode } from "./types";

const createAsciiCarrier = (
  overrides: Partial<Extract<CarrierTransformNode, { type: "ascii" }>> = {}
): Extract<CarrierTransformNode, { type: "ascii" }> => ({
  id: overrides.id ?? "ascii-1",
  type: "ascii",
  enabled: overrides.enabled ?? true,
  analysisSource: overrides.analysisSource ?? "style",
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
    backgroundMode: "none",
    backgroundBlur: 0,
    backgroundOpacity: 0,
    backgroundColor: null,
    invert: false,
    gridOverlay: false,
  },
  ...overrides,
});

const createFilter2dEffect = (
  overrides: Partial<ImageEffectNode> = {}
): ImageEffectNode => ({
  id: overrides.id ?? "filter-1",
  type: "filter2d",
  enabled: overrides.enabled ?? true,
  placement: overrides.placement ?? "style",
  params: {
    brightness: 0,
    hue: 0,
    blur: 6,
    dilate: 0,
  },
  ...overrides,
});

describe("image render snapshot plan", () => {
  it("requests a develop snapshot when an enabled carrier analyzes develop output", () => {
    const plan = createImageRenderSnapshotPlan({
      carrierTransforms: [
        createAsciiCarrier({
          id: "ascii-develop",
          analysisSource: "develop",
        }),
      ],
      effects: [],
    });

    expect(plan.requiresDevelopAnalysisSnapshot).toBe(true);
    expect(plan.requiresStyleAnalysisSnapshot).toBe(false);
  });

  it("keeps carrier, style and finalize stages in stable order", () => {
    const plan = createImageRenderSnapshotPlan({
      carrierTransforms: [createAsciiCarrier({ id: "ascii-carrier" })],
      effects: [
        createFilter2dEffect({ id: "filter-style", placement: "style" }),
        createFilter2dEffect({ id: "filter-finalize", placement: "finalize" }),
      ],
    });

    expect(plan.carrierTransforms.map((transform) => transform.id)).toEqual(["ascii-carrier"]);
    expect(plan.styleEffects.map((effect) => effect.id)).toEqual(["filter-style"]);
    expect(plan.finalizeEffects.map((effect) => effect.id)).toEqual(["filter-finalize"]);
  });

  it("keeps develop, style and finalize raster effects in stable order", () => {
    const plan = createImageRenderSnapshotPlan({
      carrierTransforms: [createAsciiCarrier({ id: "ascii-style" })],
      effects: [
        createFilter2dEffect({ id: "filter-develop", placement: "develop" }),
        createFilter2dEffect({ id: "filter-style", placement: "style" }),
        createFilter2dEffect({ id: "filter-finalize", placement: "finalize" }),
      ],
    });

    expect(plan.developEffects.map((effect) => effect.id)).toEqual(["filter-develop"]);
    expect(plan.styleEffects.map((effect) => effect.id)).toEqual(["filter-style"]);
    expect(plan.finalizeEffects.map((effect) => effect.id)).toEqual(["filter-finalize"]);
  });

  it("accepts the carrier-first stage plan without extra unsupported checks", () => {
    const plan = createImageRenderSnapshotPlan({
      carrierTransforms: [createAsciiCarrier({ analysisSource: "style" })],
      effects: [createFilter2dEffect({ placement: "style" })],
    });

    expect(() => assertSupportedImageRenderSnapshotPlan(plan)).not.toThrow();
  });
});
