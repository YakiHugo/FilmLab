import { beforeAll, describe, expect, it } from "vitest";
import { uploadExternalImageToTexture } from "@/lib/gpu/resources";
import { GPU_BRUSH_MASK_MAX_POINTS } from "@/lib/gpu/passes/mask/localShape";
import { createDefaultCanvasImageRenderState } from "./stateCompiler";
import { createImageRenderDocumentFromState, type CanvasImageRenderStateV1 } from "./types";
import { renderSingleImageToCanvas } from "./renderSingleImage";
import type { FilmProfileV2 } from "@/types/film";

// Adversarial coverage for the three render-robustness fixes in the
// render-performance-lifecycle slice: over-limit texture upload downscaling
// (resources.ts::uploadExternalImageToTexture), missing-LUT fallback
// (orchestrator.ts::buildFilmPasses), and the brush-mask point ceiling
// (orchestrator.ts::buildMask). Nothing under src/lib/gpu is mocked: the
// upload test drives the real module-level API with a real WebGPU device whose
// GPUSupportedLimits is overridden via Proxy (limits only; every method stays
// bound to the real device) because SwiftShader's real maxTextureDimension2D
// is 8192 and building a >8192px source per test run is impractical. All
// thresholds are anchored to measurements of the fixed chain under SwiftShader
// WebGPU on 2026-07-18 (see per-test comments).
//
// LUT-missing history: the first fallback iteration swapped in the 1×1×1 black
// placeholder3D with the colorLut slot still enabled at intensity 1, which
// measured a pure black frame (mean 0.00 vs 153.12 for the same profile with
// lut.enabled=false). The landed fix instead disables the failed slot
// (lutEnabled && !lut.failed et al. in buildFilmPasses), so a missing LUT is
// now semantically identical to the slot being off; the LUT test pins that
// equivalence against a lut.enabled=false twin render.

const GRAY_CARD_SIZE = 64;

let webgpuAvailable = false;

beforeAll(async () => {
  webgpuAvailable = Boolean(await navigator.gpu?.requestAdapter());
});

const requireWebGPU = (ctx: { skip: () => never }) => {
  if (!webgpuAvailable) {
    ctx.skip();
  }
};

const makeGrayCard = async (size: number, value: number) => {
  const canvas = window.document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("2d context unavailable on gray card canvas");
  }
  const imageData = context.createImageData(size, size);
  for (let index = 0; index < imageData.data.length; index += 4) {
    imageData.data[index] = value;
    imageData.data[index + 1] = value;
    imageData.data[index + 2] = value;
    imageData.data[index + 3] = 255;
  }
  context.putImageData(imageData, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) {
    throw new Error("gray card toBlob returned null");
  }
  const bitmap = await createImageBitmap(blob);
  const objectUrl = URL.createObjectURL(blob);
  return { bitmap, objectUrl };
};

const renderScenario = async (
  id: string,
  bitmap: ImageBitmap,
  objectUrl: string,
  mutateState?: (state: CanvasImageRenderStateV1) => void
) => {
  const state = createDefaultCanvasImageRenderState();
  mutateState?.(state);
  const document = createImageRenderDocumentFromState({
    id,
    source: {
      assetId: `${id}-source`,
      objectUrl,
      name: `${id}-source`,
      mimeType: "image/png",
      width: bitmap.width,
      height: bitmap.height,
    },
    state,
  });
  const canvas = window.document.createElement("canvas");
  await renderSingleImageToCanvas({
    canvas,
    document,
    request: {
      qualityTier: "quality",
      targetSize: { width: GRAY_CARD_SIZE, height: GRAY_CARD_SIZE },
    },
  });
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("2d context unavailable on render output canvas");
  }
  return context.getImageData(0, 0, canvas.width, canvas.height);
};

const regionMean = (pixels: ImageData, x0: number, y0: number, x1: number, y1: number) => {
  let sum = 0;
  let count = 0;
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const index = (y * pixels.width + x) * 4;
      sum += pixels.data[index] + pixels.data[index + 1] + pixels.data[index + 2];
      count += 3;
    }
  }
  return sum / count;
};

const maxAbsPixelDiff = (a: ImageData, b: ImageData) => {
  let max = 0;
  for (let index = 0; index < a.data.length; index += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      max = Math.max(max, Math.abs(a.data[index + channel] - b.data[index + channel]));
    }
  }
  return max;
};

const fullFrameMean = (pixels: ImageData) => {
  let sum = 0;
  let count = 0;
  for (let index = 0; index < pixels.data.length; index += 4) {
    sum += pixels.data[index] + pixels.data[index + 1] + pixels.data[index + 2];
    count += 3;
  }
  return sum / count;
};

// v2 fixture mirrors renderProfile.test.ts film-v2-test, except the LUT points
// at a path that does not exist under public/luts.
const makeMissingLutProfile = (lutEnabled: boolean): FilmProfileV2 => ({
  id: "film-v2-missing-lut",
  version: 2,
  name: "Missing LUT",
  type: "negative",
  toneResponse: { enabled: true, shoulder: 0.8, toe: 0.3, gamma: 1 },
  lut: { enabled: lutEnabled, path: "luts/definitely-missing.png", size: 8, intensity: 1 },
  grain: {
    enabled: false,
    amount: 0,
    size: 0.5,
    colorGrain: false,
    roughness: 0.5,
    shadowBias: 0.5,
  },
  vignette: { enabled: false, amount: 0, midpoint: 0.5, roundness: 0.5 },
});

const applyFilmProfile = (profile: FilmProfileV2) => (state: CanvasImageRenderStateV1) => {
  state.film = { profileId: null, profile, profileOverrides: null };
};

// Points pack into a 16-cell cluster centered on (0.5, 0.5) with 0.002 spacing
// — far inside one brush radius — so every count >= 16 rasterizes the same
// mask shape. The over-cap case therefore differs from the control only in
// point count: if the ceiling check regresses, the lift shows up in the
// over-cap render too.
const makeBrushClusterPoints = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    x: 0.5 + (index % 4) * 0.002,
    y: 0.5 + (Math.floor(index / 4) % 4) * 0.002,
  }));

const applyBrushRegion =
  (regionId: string, pointCount: number) => (state: CanvasImageRenderStateV1) => {
    const maskId = `${regionId}-mask`;
    state.develop.regions = [
      {
        id: regionId,
        enabled: true,
        amount: 100,
        maskId,
        adjustments: { exposure: 40 },
      },
    ];
    state.masks.byId = {
      [maskId]: {
        id: maskId,
        kind: "local-adjustment",
        sourceLocalAdjustmentId: regionId,
        mask: {
          mode: "brush",
          points: makeBrushClusterPoints(pointCount),
          brushSize: 0.25,
          feather: 0,
          flow: 1,
        },
      },
    };
  };

describe("render robustness regressions", () => {
  // uploadExternalImageToTexture with a Proxy device reporting
  // maxTextureDimension2D=64: a 128x128 source measured 64x64 (exact
  // floor(128 * 64/128) fit, format rgba8unorm) on 2026-07-18. Pre-fix the
  // same call returned the unscaled 128 with an invalid texture behind it, so
  // the exact-64 assertions are the discriminator. The 32x32 control measured
  // 32x32, pinning that the downscale branch only fires over the limit.
  it("upload beyond maxTextureDimension2D is downscaled to the limit instead of failing", async (ctx) => {
    requireWebGPU(ctx);
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error("WebGPU adapter unavailable");
    }
    const device = await adapter.requestDevice();
    const limitedDevice = new Proxy(device, {
      get(target, prop) {
        if (prop === "limits") {
          return { ...target.limits, maxTextureDimension2D: 64 };
        }
        const value = Reflect.get(target, prop);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    try {
      const { bitmap } = await makeGrayCard(128, 128);
      try {
        const over = uploadExternalImageToTexture(limitedDevice, bitmap);
        expect(over.width).toBe(64);
        expect(over.height).toBe(64);
        expect(over.texture.width).toBe(64);
        expect(over.texture.height).toBe(64);
        expect(over.format).toBe("rgba8unorm");
        over.texture.destroy();
      } finally {
        bitmap.close();
      }

      const small = await makeGrayCard(32, 128);
      try {
        const within = uploadExternalImageToTexture(limitedDevice, small.bitmap);
        expect(within.width).toBe(32);
        expect(within.height).toBe(32);
        within.texture.destroy();
      } finally {
        small.bitmap.close();
      }
    } finally {
      device.destroy();
    }
  });

  // Two regressions pinned here. Pre-fix (original code): the loadLut3DTexture
  // rejection propagated out of buildFilmPasses and rejected the whole render,
  // so the awaits themselves are the first discriminator. First fallback
  // iteration: the black placeholder was sampled with the slot still enabled,
  // measuring mean 0.00 / maxDiff 154 vs the lut.enabled=false twin. The
  // landed fix disables the failed slot, making missing identical to disabled:
  // measured means 153.12 both, maxAbsPixelDiff 0 on 2026-07-18 (the warn in
  // this test's stderr confirms the fallback branch ran). Tolerance ±3 absorbs
  // GPU float drift only; a re-enabled black placeholder lands ~154 away.
  it("a missing film LUT degrades to the LUT-disabled path instead of failing", async (ctx) => {
    requireWebGPU(ctx);
    const { bitmap, objectUrl } = await makeGrayCard(GRAY_CARD_SIZE, 128);
    try {
      const missing = await renderScenario(
        "robustness-lut-missing",
        bitmap,
        objectUrl,
        applyFilmProfile(makeMissingLutProfile(true))
      );
      const disabled = await renderScenario(
        "robustness-lut-disabled",
        bitmap,
        objectUrl,
        applyFilmProfile(makeMissingLutProfile(false))
      );
      expect(missing.width).toBe(GRAY_CARD_SIZE);
      expect(missing.height).toBe(GRAY_CARD_SIZE);
      expect(Math.abs(fullFrameMean(missing) - fullFrameMean(disabled))).toBeLessThanOrEqual(3);
      expect(maxAbsPixelDiff(missing, disabled)).toBeLessThanOrEqual(3);
    } finally {
      URL.revokeObjectURL(objectUrl);
      bitmap.close();
    }
  });

  // 513 = GPU_BRUSH_MASK_MAX_POINTS + 1, so buildMask returns null and the
  // region is skipped wholesale: the render must equal the no-region render.
  // Measured maxAbsPixelDiff 0 on 2026-07-18; the ±3 tolerance only absorbs
  // GPU float drift. Pre-fix this region rendered (lifted), so the identity
  // assertion is the discriminator.
  it("a brush mask above the point ceiling skips the region entirely", async (ctx) => {
    requireWebGPU(ctx);
    const { bitmap, objectUrl } = await makeGrayCard(GRAY_CARD_SIZE, 128);
    try {
      const noRegion = await renderScenario("robustness-brush-none", bitmap, objectUrl);
      const overCap = await renderScenario(
        "robustness-brush-over-cap",
        bitmap,
        objectUrl,
        applyBrushRegion("brush-over-cap", GPU_BRUSH_MASK_MAX_POINTS + 1)
      );
      expect(maxAbsPixelDiff(overCap, noRegion)).toBeLessThanOrEqual(3);
    } finally {
      URL.revokeObjectURL(objectUrl);
      bitmap.close();
    }
  });

  // Boundary control: 512 (= the ceiling) and 10 points must still apply the
  // region — an off-by-one (`>=` instead of `>`) would skip 512 and fail here.
  // The cluster mask solidly covers the sample rect (28..38)^2: stamps sit at
  // px ~(32,32) with radiusPx = 0.25 * 64 * 0.5 = 8, coverage [24,40]^2.
  // +40 exposure = +2 EV; measured center mean 245.4 vs base 153.1 (delta
  // +92.3) for the 10-point case on 2026-07-18, 245.4 for 512 points too.
  // Floor base+30 is ~1/3 of the measured delta, so only a region that stops
  // applying fails.
  it("brush masks at or under the ceiling still apply (512 and 10 points)", async (ctx) => {
    requireWebGPU(ctx);
    const { bitmap, objectUrl } = await makeGrayCard(GRAY_CARD_SIZE, 128);
    try {
      const noRegion = await renderScenario("robustness-brush-ctrl-none", bitmap, objectUrl);
      const atCap = await renderScenario(
        "robustness-brush-at-cap",
        bitmap,
        objectUrl,
        applyBrushRegion("brush-at-cap", GPU_BRUSH_MASK_MAX_POINTS)
      );
      const tenPoints = await renderScenario(
        "robustness-brush-ten",
        bitmap,
        objectUrl,
        applyBrushRegion("brush-ten", 10)
      );
      const rect = { x0: 28, y0: 28, x1: 38, y1: 38 };
      const base = regionMean(noRegion, rect.x0, rect.y0, rect.x1, rect.y1);
      expect(regionMean(atCap, rect.x0, rect.y0, rect.x1, rect.y1)).toBeGreaterThan(base + 30);
      expect(regionMean(tenPoints, rect.x0, rect.y0, rect.x1, rect.y1)).toBeGreaterThan(base + 30);
    } finally {
      URL.revokeObjectURL(objectUrl);
      bitmap.close();
    }
  });
});
