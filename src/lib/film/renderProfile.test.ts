import { describe, expect, it } from "vitest";
import { createDefaultCanvasImageRenderState } from "@/render/image";
import type { FilmProfile } from "@/types";
import type { FilmProfileV2, FilmProfileV3 } from "@/types/film";
import { resolveRenderProfile, resolveRenderProfileFromState } from "./renderProfile";

const createV3BaseProfile = (): FilmProfileV3 => ({
  id: "film-v3-base",
  version: 3,
  name: "V3 Base",
  type: "negative",
  toneResponse: { enabled: true, shoulder: 0.8, toe: 0.3, gamma: 1 },
  lut3d: { enabled: true, path: "luts/default.cube", size: 16, intensity: 0.8 },
  grain: {
    enabled: false,
    model: "blue-noise",
    amount: 0,
    size: 0.5,
    colorGrain: false,
    roughness: 0.5,
    shadowBias: 0.5,
    crystalDensity: 0.5,
    crystalSizeMean: 0.5,
    crystalSizeVariance: 0.35,
    colorSeparation: [1, 1, 1],
    scannerMTF: 0.55,
    filmFormat: "35mm",
  },
  vignette: { enabled: false, amount: 0, midpoint: 0.5, roundness: 0.5 },
});

const createFilmState = (profile?: FilmProfile | FilmProfileV2 | FilmProfileV3 | null) => ({
  profileId: profile?.id ?? null,
  profile: profile ?? undefined,
  profileOverrides: null,
});

describe("resolveRenderProfile", () => {
  it("returns v3 mode for a neutral canonical state", () => {
    const renderState = createDefaultCanvasImageRenderState();

    const resolved = resolveRenderProfileFromState({
      film: renderState.film,
      develop: renderState.develop,
    });

    expect(resolved.mode).toBe("v3");
    expect(resolved.mode).not.toBe("v2");
    expect(resolved.lut).toBeNull();
  });

  it("normalizes v2 LUT paths and upgrades to v3 render mode", () => {
    const v2: FilmProfileV2 = {
      id: "film-v2-test",
      version: 2,
      name: "V2 Test",
      type: "negative",
      toneResponse: { enabled: true, shoulder: 0.8, toe: 0.3, gamma: 1.0 },
      lut: { enabled: true, path: "luts/test.png", size: 8, intensity: 0.75 },
      grain: {
        enabled: false,
        amount: 0,
        size: 0.5,
        colorGrain: false,
        roughness: 0.5,
        shadowBias: 0.5,
      },
      vignette: { enabled: false, amount: 0, midpoint: 0.5, roundness: 0.5 },
    };

    const resolved = resolveRenderProfile({
      film: createFilmState(v2),
      fx: createDefaultCanvasImageRenderState().develop.fx,
    });
    expect(resolved.mode).toBe("v3");
    expect(resolved.lut).toEqual({
      path: "/luts/test.png",
      size: 8,
      intensity: 0.75,
    });
  });

  it("resolves stock profile ids through the built-in v2 registry", () => {
    const resolved = resolveRenderProfile({
      film: {
        profileId: "stock-portra-400",
        profile: undefined,
        profileOverrides: null,
      },
      fx: createDefaultCanvasImageRenderState().develop.fx,
    });
    expect(resolved.mode).toBe("v3");
    expect(resolved.v2.id).toBe("stock-portra-400");
    expect(resolved.lut).toEqual({
      path: "/luts/stocks/portra400.png",
      size: 8,
      intensity: 0.78,
    });
  });

  it("applies custom LUT override from state", () => {
    const renderState = createDefaultCanvasImageRenderState();
    renderState.develop.fx.customLut = {
      enabled: true,
      path: "luts/custom/test.cube",
      size: 16,
      intensity: 0.6,
    };

    const resolved = resolveRenderProfileFromState({
      film: renderState.film,
      develop: renderState.develop,
    });
    expect(resolved.customLut).toEqual({
      path: "/luts/custom/test.cube",
      size: 16,
      intensity: 0.6,
    });
  });

  it("resolves print custom LUT path/size for v3 print stock", () => {
    const resolved = resolveRenderProfile({
      film: createFilmState({
        ...createV3BaseProfile(),
        id: "film-v3-print-custom",
        name: "Print Custom",
        lut3d: { enabled: false, path: "", size: 16, intensity: 0 },
        print: {
          enabled: true,
          stock: "custom",
          density: 0,
          contrast: 0,
          warmth: 0,
          lutPath: "luts/print/custom.cube",
          lutSize: 16,
        },
      }),
      fx: createDefaultCanvasImageRenderState().develop.fx,
    });

    expect(resolved.mode).toBe("v3");
    expect(resolved.printLut).toEqual({
      path: "/luts/print/custom.cube",
      size: 16,
    });
  });

  it("applies push/pull override and resolves blended stop LUTs", () => {
    const renderState = createDefaultCanvasImageRenderState();
    renderState.develop.fx.pushPullEv = -0.61;

    const resolved = resolveRenderProfile({
      film: createFilmState({
        ...createV3BaseProfile(),
        pushPull: {
          enabled: true,
          ev: 0,
          minEv: -2,
          maxEv: 2,
          lutByStop: {
            "-1": {
              path: "luts/pushpull/m1.cube",
              size: 16,
              intensity: 0.7,
            },
            "1": {
              path: "luts/pushpull/p1.cube",
              size: 16,
              intensity: 0.9,
            },
          },
        },
      }),
      fx: renderState.develop.fx,
    });

    expect(resolved.mode).toBe("v3");
    expect(resolved.pushPull.source).toBe("state");
    expect(resolved.pushPull.ev).toBeCloseTo(-0.61, 3);
    expect(resolved.pushPull.selectedStop).toBe(-1);
    expect(resolved.lut?.path).toBe("/luts/pushpull/m1.cube");
    expect(resolved.lut?.size).toBe(16);
    expect(resolved.lut?.intensity ?? 0).toBeCloseTo(0.739, 3);
    expect(resolved.lutBlend?.path).toBe("/luts/pushpull/p1.cube");
    expect(resolved.lutBlend?.size).toBe(16);
    expect(resolved.lutBlend?.mixFactor ?? 0).toBeCloseTo(0.195, 3);
  });

  it("uses nearest push/pull stop without blend at out-of-range EV", () => {
    const renderState = createDefaultCanvasImageRenderState();
    renderState.develop.fx.pushPullEv = -2;

    const resolved = resolveRenderProfile({
      film: createFilmState({
        ...createV3BaseProfile(),
        pushPull: {
          enabled: true,
          ev: 0,
          minEv: -2,
          maxEv: 2,
          lutByStop: {
            "-1": {
              path: "luts/pushpull/m1.cube",
              size: 16,
              intensity: 0.7,
            },
            "1": {
              path: "luts/pushpull/p1.cube",
              size: 16,
              intensity: 0.9,
            },
          },
        },
      }),
      fx: renderState.develop.fx,
    });

    expect(resolved.pushPull.selectedStop).toBe(-1);
    expect(resolved.lut).toEqual({
      path: "/luts/pushpull/m1.cube",
      size: 16,
      intensity: 0.7,
    });
    expect(resolved.lutBlend).toBeNull();
  });

  it("clamps push/pull EV into configured profile range", () => {
    const renderState = createDefaultCanvasImageRenderState();
    renderState.develop.fx.pushPullEv = 2;

    const resolved = resolveRenderProfile({
      film: createFilmState({
        ...createV3BaseProfile(),
        pushPull: {
          enabled: true,
          ev: 0,
          minEv: -0.5,
          maxEv: 1,
        },
      }),
      fx: renderState.develop.fx,
    });

    expect(resolved.pushPull.source).toBe("state");
    expect(resolved.pushPull.ev).toBe(1);
  });

  it("normalizes advanced v3 fields like print white and gate weave", () => {
    const resolved = resolveRenderProfile({
      film: createFilmState({
        ...createV3BaseProfile(),
        print: {
          enabled: true,
          stock: "kodak-2383",
          density: 0,
          contrast: 0,
          warmth: 0,
          targetWhiteKelvin: 7000,
        },
        gateWeave: {
          enabled: true,
          amount: 2,
          seed: Number.NaN,
        },
      }),
      fx: createDefaultCanvasImageRenderState().develop.fx,
    });

    expect(resolved.v3.print?.targetWhiteKelvin).toBe(6500);
    expect(resolved.v3.gateWeave?.amount).toBe(1);
    expect(resolved.v3.gateWeave?.seed).toBe(0);
  });

  it("preserves grain and vignette from canonical runtime state without an explicit film profile", () => {
    const renderState = createDefaultCanvasImageRenderState();
    renderState.develop.fx.grain = 48;
    renderState.develop.fx.grainSize = 62;
    renderState.develop.fx.grainRoughness = 73;
    renderState.develop.fx.vignette = 28;

    const resolved = resolveRenderProfileFromState({
      film: renderState.film,
      develop: renderState.develop,
    });

    expect(resolved.mode).toBe("v3");
    expect(resolved.v3.grain.enabled).toBe(true);
    expect(resolved.v3.grain.amount).toBeCloseTo(0.48, 4);
    expect(resolved.v3.grain.size).toBeCloseTo(0.62, 4);
    expect(resolved.v3.grain.roughness).toBeCloseTo(0.73, 4);
    expect(resolved.v3.vignette.enabled).toBe(true);
    expect(resolved.v3.vignette.amount).toBeCloseTo(0.28, 4);
  });
});
