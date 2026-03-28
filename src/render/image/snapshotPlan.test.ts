import { describe, expect, it } from "vitest";
import { createImageRenderSnapshotPlan, assertSupportedImageRenderSnapshotPlan } from "./snapshotPlan";
import type { ImageEffectNode } from "./types";

const createAsciiEffect = (
  overrides: Partial<Extract<ImageEffectNode, { type: "ascii" }>> = {}
): Extract<ImageEffectNode, { type: "ascii" }> => ({
  id: overrides.id ?? "ascii-1",
  type: "ascii",
  enabled: overrides.enabled ?? true,
  placement: overrides.placement ?? "afterFilm",
  analysisSource: overrides.analysisSource ?? "afterFilm",
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
  it("requests a develop snapshot when an enabled ascii effect analyzes afterDevelop", () => {
    const plan = createImageRenderSnapshotPlan([
      createAsciiEffect({
        id: "ascii-develop",
        analysisSource: "afterDevelop",
      }),
    ]);

    expect(plan.requiresDevelopAnalysisSnapshot).toBe(true);
    expect(plan.requiresFilmAnalysisSnapshot).toBe(false);
  });

  it("keeps afterDevelop, afterFilm and afterOutput effects in stable order", () => {
    const plan = createImageRenderSnapshotPlan([
      createAsciiEffect({ id: "ascii-after-develop", placement: "afterDevelop" }),
      createAsciiEffect({ id: "ascii-after-film", placement: "afterFilm" }),
      {
        id: "filter-after-output",
        type: "filter2d",
        enabled: true,
        placement: "afterOutput",
        params: {
          brightness: 0,
          hue: 0,
          blur: 6,
          dilate: 0,
        },
      },
    ]);

    expect(plan.afterDevelopEffects.map((effect) => effect.id)).toEqual(["ascii-after-develop"]);
    expect(plan.afterFilmEffects.map((effect) => effect.id)).toEqual(["ascii-after-film"]);
    expect(plan.afterOutputEffects.map((effect) => effect.id)).toEqual(["filter-after-output"]);
  });

  it("keeps afterFilm and afterOutput effects in stable order", () => {
    const plan = createImageRenderSnapshotPlan([
      createAsciiEffect({ id: "ascii-after-film", placement: "afterFilm" }),
      {
        id: "filter-after-output",
        type: "filter2d",
        enabled: true,
        placement: "afterOutput",
        params: {
          brightness: 0,
          hue: 0,
          blur: 6,
          dilate: 0,
        },
      },
    ]);

    expect(plan.afterFilmEffects.map((effect) => effect.id)).toEqual(["ascii-after-film"]);
    expect(plan.afterOutputEffects.map((effect) => effect.id)).toEqual(["filter-after-output"]);
  });

  it("fails fast when an afterDevelop ascii effect asks for afterFilm analysis", () => {
    const plan = createImageRenderSnapshotPlan([
      createAsciiEffect({
        id: "ascii-after-develop",
        placement: "afterDevelop",
        analysisSource: "afterFilm",
      }),
    ]);

    expect(() => assertSupportedImageRenderSnapshotPlan(plan)).toThrow(
      "afterDevelop effects cannot analyze afterFilm snapshots"
    );
  });
});
