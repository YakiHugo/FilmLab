import { describe, expect, it } from "vitest";
import { createDefaultAdjustments } from "@/lib/adjustments";
import type { FilmProfile } from "@/types";
import type { FilmProfileV2, FilmProfileV3 } from "@/types/film";
import { resolveRenderProfile } from "./renderProfile";

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

describe("resolveRenderProfile", () => {
  it("returns legacy-v1 mode for runtime adjustments", () => {
    const resolved = resolveRenderProfile(createDefaultAdjustments());
    expect(resolved.mode).toBe("legacy-v1");
    expect(resolved.mode).not.toBe("v2");
    expect(resolved.legacyV1).toBeDefined();
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

    const resolved = resolveRenderProfile(createDefaultAdjustments(), v2);
    expect(resolved.mode).toBe("v3");
    expect(resolved.lut).toEqual({
      path: "/luts/test.png",
      size: 8,
      intensity: 0.75,
    });
  });

  it("switches stock legacy profile ids to v3 LUT mode", () => {
    const stockLegacy: FilmProfile = {
      id: "stock-portra-400",
      version: 1,
      name: "Stock Legacy Stub",
      modules: [],
    };
    const resolved = resolveRenderProfile(createDefaultAdjustments(), stockLegacy);
    expect(resolved.mode).toBe("v3");
    expect(resolved.v2.id).toBe("stock-portra-400");
    expect(resolved.lut).toEqual({
      path: "/luts/stocks/portra400.png",
      size: 8,
      intensity: 0.78,
    });
  });

  it("applies custom LUT override from adjustments", () => {
    const adjustments = createDefaultAdjustments();
    adjustments.customLut = {
      enabled: true,
      path: "luts/custom/test.cube",
      size: 16,
      intensity: 0.6,
    };

    const resolved = resolveRenderProfile(adjustments);
    expect(resolved.customLut).toEqual({
      path: "/luts/custom/test.cube",
      size: 16,
      intensity: 0.6,
    });
  });

  it("resolves print custom LUT path/size for v3 print stock", () => {
    const base = createDefaultAdjustments();
    const resolved = resolveRenderProfile(base, {
      id: "film-v3-print-custom",
      version: 3,
      name: "Print Custom",
      type: "negative",
      toneResponse: { enabled: false, shoulder: 0.8, toe: 0.3, gamma: 1 },
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

    expect(resolved.mode).toBe("v3");
    expect(resolved.printLut).toEqual({
      path: "/luts/print/custom.cube",
      size: 16,
    });
  });

  it("applies push/pull override and resolves blended stop LUTs", () => {
    const adjustments = createDefaultAdjustments();
    adjustments.pushPullEv = -0.61;

    const resolved = resolveRenderProfile(adjustments, {
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
    });

    expect(resolved.mode).toBe("v3");
    expect(resolved.pushPull.source).toBe("adjustments");
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
    const adjustments = createDefaultAdjustments();
    adjustments.pushPullEv = -2;

    const resolved = resolveRenderProfile(adjustments, {
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
    const adjustments = createDefaultAdjustments();
    adjustments.pushPullEv = 2;

    const resolved = resolveRenderProfile(adjustments, {
      ...createV3BaseProfile(),
      pushPull: {
        enabled: true,
        ev: 0,
        minEv: -0.5,
        maxEv: 1,
      },
    });

    expect(resolved.pushPull.source).toBe("adjustments");
    expect(resolved.pushPull.ev).toBe(1);
  });

  it("normalizes advanced v3 fields like print white and gate weave", () => {
    const resolved = resolveRenderProfile(createDefaultAdjustments(), {
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
    });

    expect(resolved.v3.print?.targetWhiteKelvin).toBe(6500);
    expect(resolved.v3.gateWeave?.amount).toBe(1);
    expect(resolved.v3.gateWeave?.seed).toBe(0);
  });
});
