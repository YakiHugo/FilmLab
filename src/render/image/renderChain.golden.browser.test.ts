import { beforeAll, describe, expect, it } from "vitest";
import { commands } from "vitest/browser";
import { createDefaultCanvasImageRenderState } from "./stateCompiler";
import { createImageRenderDocumentFromState, type CanvasImageRenderStateV1 } from "./types";
import { renderSingleImageToCanvas } from "./renderSingleImage";

declare module "vitest/internal/browser" {
  interface BrowserCommands {
    goldenFileExists: (relativePath: string) => Promise<boolean>;
    saveGoldenFile: (relativePath: string, base64Png: string) => Promise<void>;
    readTestAsset: (relativePath: string) => Promise<string>;
  }
}

// Chain-level golden coverage intentionally runs the real renderFull chain:
// nothing under src/lib/gpu is mocked, per the AGENTS.md mock-discipline rule.
// Golden update flow: delete the stale PNG under test-assets/baselines/golden/
// and re-run `pnpm test:browser`; the first run regenerates and fails, the
// second compares.

const GOLDEN_MAX_CHANNEL_DELTA = 2;
const GOLDEN_MAX_OUTLIER_RATIO = 0.005;

let webgpuAvailable = false;

beforeAll(async () => {
  webgpuAvailable = Boolean(await navigator.gpu?.requestAdapter());
});

const requireWebGPU = (ctx: { skip: () => never }) => {
  if (!webgpuAvailable) {
    ctx.skip();
  }
};

const base64ToBlob = (base64: string, mimeType: string) => {
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  return new Blob([bytes], { type: mimeType });
};

const loadImageFromTestAssets = async (relativePath: string, mimeType: string) => {
  const base64 = await commands.readTestAsset(relativePath);
  const blob = base64ToBlob(base64, mimeType);
  const bitmap = await createImageBitmap(blob);
  const objectUrl = URL.createObjectURL(blob);
  return { bitmap, objectUrl };
};

const renderStateToCanvas = async ({
  bitmap,
  objectUrl,
  targetSize,
  state,
}: {
  bitmap: ImageBitmap;
  objectUrl: string;
  targetSize: { width: number; height: number };
  state?: CanvasImageRenderStateV1;
}) => {
  const document = createImageRenderDocumentFromState({
    id: `golden-${targetSize.width}x${targetSize.height}`,
    source: {
      assetId: "golden-source",
      objectUrl,
      name: "golden-source",
      mimeType: "image/jpeg",
      width: bitmap.width,
      height: bitmap.height,
    },
    state: state ?? createDefaultCanvasImageRenderState(),
  });
  const canvas = window.document.createElement("canvas");
  await renderSingleImageToCanvas({
    canvas,
    document,
    request: { qualityTier: "quality", targetSize },
  });
  return canvas;
};

const readCanvasPngBase64 = async (canvas: HTMLCanvasElement) => {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) {
    throw new Error("canvas.toBlob returned null");
  }
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
};

const canvasPixels = (canvas: HTMLCanvasElement) => {
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("2d context unavailable on render output canvas");
  }
  return context.getImageData(0, 0, canvas.width, canvas.height);
};

const compareWithGolden = async (goldenName: string, canvas: HTMLCanvasElement) => {
  if (!(await commands.goldenFileExists(goldenName))) {
    const base64 = await readCanvasPngBase64(canvas);
    await commands.saveGoldenFile(goldenName, base64);
    return { generated: true as const };
  }
  const goldenBase64 = await commands.readTestAsset(`baselines/golden/${goldenName}`);
  const goldenBitmap = await createImageBitmap(base64ToBlob(goldenBase64, "image/png"));
  const goldenCanvas = window.document.createElement("canvas");
  goldenCanvas.width = goldenBitmap.width;
  goldenCanvas.height = goldenBitmap.height;
  const goldenContext = goldenCanvas.getContext("2d");
  if (!goldenContext) {
    throw new Error("2d context unavailable on golden canvas");
  }
  goldenContext.drawImage(goldenBitmap, 0, 0);
  const goldenPixels = goldenContext.getImageData(0, 0, goldenBitmap.width, goldenBitmap.height);
  const actualPixels = canvasPixels(canvas);

  expect(actualPixels.width).toBe(goldenPixels.width);
  expect(actualPixels.height).toBe(goldenPixels.height);

  let outliers = 0;
  let maxDelta = 0;
  for (let index = 0; index < actualPixels.data.length; index += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      const delta = Math.abs(actualPixels.data[index + channel] - goldenPixels.data[index + channel]);
      if (delta > maxDelta) {
        maxDelta = delta;
      }
      if (delta > GOLDEN_MAX_CHANNEL_DELTA) {
        outliers += 1;
        break;
      }
    }
  }
  const outlierRatio = outliers / (actualPixels.data.length / 4);
  return {
    generated: false as const,
    maxDelta,
    outlierRatio,
  };
};

const expectGoldenMatch = async (goldenName: string, canvas: HTMLCanvasElement) => {
  const result = await compareWithGolden(goldenName, canvas);
  if (result.generated) {
    throw new Error(`golden ${goldenName} was missing and has been generated; re-run to compare`);
  }
  expect(result.outlierRatio).toBeLessThanOrEqual(GOLDEN_MAX_OUTLIER_RATIO);
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

describe("render chain golden coverage", () => {
  it("default chain matches golden for a portrait photo", async (ctx) => {
    requireWebGPU(ctx);
    const { bitmap, objectUrl } = await loadImageFromTestAssets(
      "images/unsplash_4c7lecfas1M.jpg",
      "image/jpeg"
    );
    try {
      const canvas = await renderStateToCanvas({
        bitmap,
        objectUrl,
        targetSize: { width: 320, height: 212 },
      });
      await expectGoldenMatch("default-portrait-320.png", canvas);
    } finally {
      URL.revokeObjectURL(objectUrl);
      bitmap.close();
    }
  });

  it("default chain matches golden for a landscape photo", async (ctx) => {
    requireWebGPU(ctx);
    const { bitmap, objectUrl } = await loadImageFromTestAssets(
      "images/unsplash_PhciG8fpRKw.jpg",
      "image/jpeg"
    );
    try {
      const canvas = await renderStateToCanvas({
        bitmap,
        objectUrl,
        targetSize: { width: 320, height: 240 },
      });
      await expectGoldenMatch("default-landscape-320.png", canvas);
    } finally {
      URL.revokeObjectURL(objectUrl);
      bitmap.close();
    }
  });

  it("film chain with a stock profile matches golden", async (ctx) => {
    requireWebGPU(ctx);
    const { bitmap, objectUrl } = await loadImageFromTestAssets(
      "images/unsplash_4c7lecfas1M.jpg",
      "image/jpeg"
    );
    const state = createDefaultCanvasImageRenderState();
    state.film = { profileId: "stock-portra-400", profile: undefined, profileOverrides: null };
    try {
      const canvas = await renderStateToCanvas({
        bitmap,
        objectUrl,
        targetSize: { width: 320, height: 212 },
        state,
      });
      await expectGoldenMatch("film-portra-portrait-320.png", canvas);
    } finally {
      URL.revokeObjectURL(objectUrl);
      bitmap.close();
    }
  });

  // Reproduction test for the double sRGB decode in the develop chain
  // (inputDecode decodes, then geometry.wgsl decodes again). A neutral 0.5
  // gray card must round-trip through the identity chain near 128; the double
  // decode drags it to ~56-66. Marked expected-to-fail until
  // decode-double-srgb-fix lands; then remove `.fails`.
  it.fails("midtone probe: neutral 0.5 gray survives the default chain", async (ctx) => {
    requireWebGPU(ctx);
    const size = 64;
    const { bitmap, objectUrl } = await makeGrayCard(size, 128);
    try {
      const canvas = await renderStateToCanvas({
        bitmap,
        objectUrl,
        targetSize: { width: size, height: size },
      });
      const pixels = canvasPixels(canvas);
      let sum = 0;
      let count = 0;
      for (let index = 0; index < pixels.data.length; index += 4) {
        sum += pixels.data[index] + pixels.data[index + 1] + pixels.data[index + 2];
        count += 3;
      }
      const mean = sum / count;
      expect(mean).toBeGreaterThanOrEqual(120);
      expect(mean).toBeLessThanOrEqual(135);
    } finally {
      URL.revokeObjectURL(objectUrl);
      bitmap.close();
    }
  });
});
