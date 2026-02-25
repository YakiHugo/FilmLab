import { describe, expect, it } from "vitest";
import { createDefaultAdjustments } from "@/lib/adjustments";
import type { FilmProfile } from "@/types";
import type { FilmProfileV2 } from "@/types/film";
import { resolveRenderProfile } from "./renderProfile";

describe("resolveRenderProfile", () => {
  it("returns legacy-v1 mode for runtime adjustments", () => {
    const resolved = resolveRenderProfile(createDefaultAdjustments());
    expect(resolved.mode).toBe("legacy-v1");
    expect(resolved.legacyV1).toBeDefined();
    expect(resolved.lut).toBeNull();
  });

  it("normalizes v2 LUT paths and keeps v2 mode", () => {
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
    expect(resolved.mode).toBe("v2");
    expect(resolved.lut).toEqual({
      path: "/luts/test.png",
      size: 8,
      intensity: 0.75,
    });
  });

  it("switches stock legacy profile ids to v2 LUT mode", () => {
    const stockLegacy: FilmProfile = {
      id: "stock-portra-400",
      version: 1,
      name: "Stock Legacy Stub",
      modules: [],
    };
    const resolved = resolveRenderProfile(createDefaultAdjustments(), stockLegacy);
    expect(resolved.mode).toBe("v2");
    expect(resolved.v2.id).toBe("stock-portra-400");
    expect(resolved.lut).toEqual({
      path: "/luts/stocks/portra400.png",
      size: 8,
      intensity: 0.78,
    });
  });
});
