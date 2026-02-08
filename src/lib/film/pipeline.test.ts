import { describe, expect, it } from "vitest";
import type { FilmProfile } from "@/types";
import { applyFilmPipeline } from "./pipeline";
import { computeMae } from "@/lib/testing/pixelDiff";

const createTestProfile = (): FilmProfile => ({
  id: "test-profile",
  version: 1,
  name: "Test Profile",
  modules: [
    {
      id: "colorScience",
      enabled: false,
      amount: 100,
      seedMode: "perAsset",
      params: {
        lutStrength: 0,
        lutAssetId: undefined,
        rgbMix: [1, 1, 1],
        temperatureShift: 0,
        tintShift: 0,
      },
    },
    {
      id: "tone",
      enabled: false,
      amount: 100,
      params: {
        exposure: 0,
        contrast: 0,
        highlights: 0,
        shadows: 0,
        whites: 0,
        blacks: 0,
        curveHighlights: 0,
        curveLights: 0,
        curveDarks: 0,
        curveShadows: 0,
      },
    },
    {
      id: "scan",
      enabled: false,
      amount: 100,
      seedMode: "perAsset",
      params: {
        halationThreshold: 0.88,
        halationAmount: 0,
        bloomThreshold: 0.82,
        bloomAmount: 0,
        vignetteAmount: 0,
        scanWarmth: 0,
      },
    },
    {
      id: "grain",
      enabled: true,
      amount: 100,
      seedMode: "perAsset",
      params: {
        amount: 0.5,
        size: 0.5,
        roughness: 0.5,
        color: 0.2,
        shadowBoost: 0.5,
      },
    },
    {
      id: "defects",
      enabled: false,
      amount: 0,
      seedMode: "perRender",
      params: {
        leakProbability: 0,
        leakStrength: 0,
        dustAmount: 0,
        scratchAmount: 0,
      },
    },
  ],
});

const createImageData = () =>
  ({
    width: 4,
    height: 4,
    data: new Uint8ClampedArray(4 * 4 * 4).fill(120),
  }) as ImageData;

describe("applyFilmPipeline", () => {
  it("keeps same result with same seed input", () => {
    const profile = createTestProfile();
    const first = createImageData();
    const second = createImageData();
    applyFilmPipeline(first, profile, {
      seedKey: "asset-1",
      seedSalt: 5,
      renderSeed: 100,
    });
    applyFilmPipeline(second, profile, {
      seedKey: "asset-1",
      seedSalt: 5,
      renderSeed: 200,
    });
    expect(first.data).toEqual(second.data);
  });

  it("changes result when seed salt changes", () => {
    const profile = createTestProfile();
    const first = createImageData();
    const second = createImageData();
    applyFilmPipeline(first, profile, {
      seedKey: "asset-1",
      seedSalt: 1,
      renderSeed: 100,
    });
    applyFilmPipeline(second, profile, {
      seedKey: "asset-1",
      seedSalt: 2,
      renderSeed: 100,
    });
    expect(first.data).not.toEqual(second.data);
  });

  it("enforces MAE threshold utility", () => {
    const a = new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 255]);
    const b = new Uint8ClampedArray([11, 19, 31, 255, 41, 48, 63, 255]);
    const mae = computeMae(a, b);
    expect(mae).toBeLessThanOrEqual(2 / 255);
  });
});

