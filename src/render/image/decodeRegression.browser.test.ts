import { beforeAll, describe, expect, it } from "vitest";
import { createDefaultCanvasImageRenderState } from "./stateCompiler";
import { createImageRenderDocumentFromState, type CanvasImageRenderStateV1 } from "./types";
import { renderSingleImageToCanvas } from "./renderSingleImage";

// Adversarial coverage for the double sRGB decode fix (geometry.wgsl used to
// decode a second time after inputDecode, darkening the whole image).
// renderChain.golden.browser.test.ts pins the neutral 0.5-gray case; these
// tests pin the geometry transform branch, the shadow floor, and tonality
// monotonicity. All thresholds below are anchored to measurements of the
// fixed chain under SwiftShader WebGPU (see per-test comments); nothing under
// src/lib/gpu is mocked.

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

const renderGrayCardMean = async (
  value: number,
  mutateState?: (state: CanvasImageRenderStateV1) => void
) => {
  const { bitmap, objectUrl } = await makeGrayCard(GRAY_CARD_SIZE, value);
  try {
    const state = createDefaultCanvasImageRenderState();
    mutateState?.(state);
    const document = createImageRenderDocumentFromState({
      id: `decode-regression-${value}-${mutateState ? "transformed" : "plain"}`,
      source: {
        assetId: "decode-regression-source",
        objectUrl,
        name: "decode-regression-source",
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
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    let sum = 0;
    let count = 0;
    for (let index = 0; index < pixels.data.length; index += 4) {
      sum += pixels.data[index] + pixels.data[index + 1] + pixels.data[index + 2];
      count += 3;
    }
    return sum / count;
  } finally {
    URL.revokeObjectURL(objectUrl);
    bitmap.close();
  }
};

describe("double sRGB decode regression", () => {
  // The golden suite's midtone probe only renders the neutral state, where the
  // geometry pass samples with an identity mapping. Here a 4:5 aspectRatio on
  // a square source forces a non-full cropRect, so the geometry pass runs its
  // transform branch with real resampling. A uniform card makes the crop
  // itself lossless, so the mean must land at the same anchor as the neutral
  // render (~153, measured post-fix under SwiftShader; this branch measured
  // 153.1 on 2026-07-17); a double decode in this branch would drag it to
  // ~56-66 instead.
  // Band [140,165]: the passthrough probe's ±9 GPU float slack, widened by a
  // few points for bilinear resampling differences in this branch.
  it("geometry transform branch decodes exactly once: cropped 0.5 gray keeps the neutral anchor", async (ctx) => {
    requireWebGPU(ctx);
    const mean = await renderGrayCardMean(128, (state) => {
      state.geometry.aspectRatio = "4:5";
    });
    expect(mean).toBeGreaterThanOrEqual(140);
    expect(mean).toBeLessThanOrEqual(165);
  });

  // Double decoding crushes shadows hardest: 0.1 gray (26/255) would land at
  // <=12/255. The fixed chain measures ~41.7 under SwiftShader (2026-07-17)
  // because single decode plus the neutral film tone lifts shadows. Threshold
  // 20 sits well above the regression ceiling and ~22 below the measurement,
  // so it only fails on a real decode regression, not on GPU float drift.
  it("shadows are not crushed: 0.1 gray stays well above the double-decode floor", async (ctx) => {
    requireWebGPU(ctx);
    const mean = await renderGrayCardMean(26);
    expect(mean).toBeGreaterThanOrEqual(20);
  });

  it("default chain tonality is strictly increasing across 0.25/0.5/0.75 gray", async (ctx) => {
    requireWebGPU(ctx);
    const mean25 = await renderGrayCardMean(64);
    const mean50 = await renderGrayCardMean(128);
    const mean75 = await renderGrayCardMean(191);
    expect(mean25).toBeLessThan(mean50);
    expect(mean50).toBeLessThan(mean75);
  });
});
