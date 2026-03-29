import { describe, expect, it } from "vitest";
import { createImageRenderSnapshotPlan, assertSupportedImageRenderSnapshotPlan } from "./snapshotPlan";
import type { ImageEffectNode } from "./types";

const createAsciiEffect = (
  overrides: Partial<Extract<ImageEffectNode, { type: "ascii" }>> = {}
): Extract<ImageEffectNode, { type: "ascii" }> => ({
  id: overrides.id ?? "ascii-1",
  type: "ascii",
  enabled: overrides.enabled ?? true,
  placement: overrides.placement ?? "style",
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

describe("image render snapshot plan", () => {
  it("requests a develop snapshot when an enabled ascii effect analyzes develop output", () => {
    const plan = createImageRenderSnapshotPlan([
      createAsciiEffect({
        id: "ascii-develop",
        analysisSource: "develop",
      }),
    ]);

    expect(plan.requiresDevelopAnalysisSnapshot).toBe(true);
    expect(plan.requiresStyleAnalysisSnapshot).toBe(false);
  });

  it("keeps develop, style and finalize effects in stable order", () => {
    const plan = createImageRenderSnapshotPlan([
      createAsciiEffect({ id: "ascii-develop", placement: "develop" }),
      createAsciiEffect({ id: "ascii-style", placement: "style" }),
      {
        id: "filter-finalize",
        type: "filter2d",
        enabled: true,
        placement: "finalize",
        params: {
          brightness: 0,
          hue: 0,
          blur: 6,
          dilate: 0,
        },
      },
    ]);

    expect(plan.developEffects.map((effect) => effect.id)).toEqual(["ascii-develop"]);
    expect(plan.styleEffects.map((effect) => effect.id)).toEqual(["ascii-style"]);
    expect(plan.finalizeEffects.map((effect) => effect.id)).toEqual(["filter-finalize"]);
  });

  it("keeps style and finalize effects in stable order", () => {
    const plan = createImageRenderSnapshotPlan([
      createAsciiEffect({ id: "ascii-style", placement: "style" }),
      {
        id: "filter-finalize",
        type: "filter2d",
        enabled: true,
        placement: "finalize",
        params: {
          brightness: 0,
          hue: 0,
          blur: 6,
          dilate: 0,
        },
      },
    ]);

    expect(plan.styleEffects.map((effect) => effect.id)).toEqual(["ascii-style"]);
    expect(plan.finalizeEffects.map((effect) => effect.id)).toEqual(["filter-finalize"]);
  });

  it("fails fast when a develop-stage ascii effect asks for style analysis", () => {
    const plan = createImageRenderSnapshotPlan([
      createAsciiEffect({
        id: "ascii-develop",
        placement: "develop",
        analysisSource: "style",
      }),
    ]);

    expect(() => assertSupportedImageRenderSnapshotPlan(plan)).toThrow(
      "develop-stage effects cannot analyze style snapshots"
    );
  });
});
