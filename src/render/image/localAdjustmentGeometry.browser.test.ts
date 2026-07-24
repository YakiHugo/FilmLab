import { beforeAll, describe, expect, it } from "vitest";
import { createDefaultCanvasImageRenderState } from "./stateCompiler";
import { createImageRenderDocumentFromState, type CanvasImageRenderStateV1 } from "./types";
import { renderSingleImageToCanvas } from "./renderSingleImage";

// Adversarial coverage for the local-adjustment geometry fix: the per-region
// develop chain must sample the source with the same crop/flip geometry as the
// base chain. Before the fix it ran with passthrough geometry, so a mask drawn
// on the cropped/flipped frame was filled with content from the wrong source
// area. Masks rasterize in output space, so any geometry mismatch shows up as
// the masked area carrying content from outside the visible frame. All
// thresholds below are anchored to measurements of the fixed chain under
// SwiftShader WebGPU on 2026-07-18 (see per-test comments); nothing under
// src/lib/gpu is mocked. The pre-fix ("buggy-equivalent") values cited in the
// comments were measured black-box by rendering the same mask+region without
// any crop/flip — that is exactly the content the old chain blended.

const SOURCE_SIZE = 128;
const OUTPUT_SIZE = 128;
const DARK = 20;
const BRIGHT = 235;

let webgpuAvailable = false;

beforeAll(async () => {
  webgpuAvailable = Boolean(await navigator.gpu?.requestAdapter());
});

const requireWebGPU = (ctx: { skip: () => never }) => {
  if (!webgpuAvailable) {
    ctx.skip();
  }
};

const makeColumnCard = async (fillColumn: (x: number) => number) => {
  const canvas = window.document.createElement("canvas");
  canvas.width = SOURCE_SIZE;
  canvas.height = SOURCE_SIZE;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("2d context unavailable on split card canvas");
  }
  const imageData = context.createImageData(SOURCE_SIZE, SOURCE_SIZE);
  for (let y = 0; y < SOURCE_SIZE; y += 1) {
    for (let x = 0; x < SOURCE_SIZE; x += 1) {
      const value = fillColumn(x);
      const index = (y * SOURCE_SIZE + x) * 4;
      imageData.data[index] = value;
      imageData.data[index + 1] = value;
      imageData.data[index + 2] = value;
      imageData.data[index + 3] = 255;
    }
  }
  context.putImageData(imageData, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) {
    throw new Error("split card toBlob returned null");
  }
  const bitmap = await createImageBitmap(blob);
  const objectUrl = URL.createObjectURL(blob);
  return { bitmap, objectUrl };
};

const renderScenario = async ({
  bitmap,
  objectUrl,
  id,
  mutateState,
}: {
  bitmap: ImageBitmap;
  objectUrl: string;
  id: string;
  mutateState?: (state: CanvasImageRenderStateV1) => void;
}) => {
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
      targetSize: { width: OUTPUT_SIZE, height: OUTPUT_SIZE },
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

// bright | dark | bright column bands. Crops are centered, so only a centered
// dark band lets the 1:2 crop isolate a uniformly dark frame.
const darkCenterBandFill = (x: number) => (x >= 32 && x < 96 ? DARK : BRIGHT);
const leftDarkFill = (x: number) => (x < 64 ? DARK : BRIGHT);

const applyCropGeometry = (state: CanvasImageRenderStateV1) => {
  state.geometry.aspectRatio = "1:2";
};

const applyFlipGeometry = (state: CanvasImageRenderStateV1) => {
  state.geometry.flipHorizontal = true;
};

interface RadialMaskPlacement {
  centerX: number;
  centerY: number;
  radiusX: number;
  radiusY: number;
}

// Solidly inside the dark area of each scenario's output frame; every pixel of
// the sample rects below sits well inside the hard-edged (feather 0) ellipse.
const CROP_MASK: RadialMaskPlacement = {
  centerX: 0.12,
  centerY: 0.5,
  radiusX: 0.08,
  radiusY: 0.16,
};
const FLIP_MASK: RadialMaskPlacement = { centerX: 0.8, centerY: 0.5, radiusX: 0.08, radiusY: 0.16 };

// +40 exposure = +2 EV in master uniforms; enough to double the dark-band
// output while keeping it far below lifted bright-band content.
const addRadialExposureRegion = (
  state: CanvasImageRenderStateV1,
  id: string,
  placement: RadialMaskPlacement
) => {
  state.develop.regions = [
    {
      id,
      enabled: true,
      amount: 100,
      maskId: `${id}-mask`,
      adjustments: { exposure: 40 },
    },
  ];
  state.masks.byId = {
    [`${id}-mask`]: {
      id: `${id}-mask`,
      kind: "local-adjustment",
      sourceLocalAdjustmentId: id,
      mask: { mode: "radial", feather: 0, ...placement },
    },
  };
};

const renderCropPair = async (bitmap: ImageBitmap, objectUrl: string, idPrefix: string) => {
  const base = await renderScenario({
    bitmap,
    objectUrl,
    id: `${idPrefix}-base`,
    mutateState: applyCropGeometry,
  });
  const adjusted = await renderScenario({
    bitmap,
    objectUrl,
    id: `${idPrefix}-adjusted`,
    mutateState: (state) => {
      applyCropGeometry(state);
      addRadialExposureRegion(state, `${idPrefix}-region`, CROP_MASK);
    },
  });
  return { base, adjusted };
};

// Sample rects (pixel coords on the 128x128 output).
const CROP_MASK_RECT = { x0: 11, y0: 54, x1: 21, y1: 74 };
const FLIP_MASK_RECT = { x0: 97, y0: 54, x1: 108, y1: 74 };
const LEFT_STRIP = { x0: 8, y0: 54, x1: 28, y1: 74 };
const RIGHT_STRIP = { x0: 100, y0: 54, x1: 120, y1: 74 };

const meanOf = (pixels: ImageData, rect: { x0: number; y0: number; x1: number; y1: number }) =>
  regionMean(pixels, rect.x0, rect.y0, rect.x1, rect.y1);

describe("local adjustment geometry regression", () => {
  // The 1:2 crop of the band card keeps only the dark center band, so the whole
  // frame renders dark (base premise strips measured 34.3/34.4). A +2 EV lift
  // masked at output u=0.12 must therefore contain lifted *dark* content:
  // measured 66.2 with the fixed chain (base 34.4, delta +31.8). The pre-fix
  // chain sampled the uncropped source, where u=0.12 lands on the bright moat;
  // the buggy-equivalent probe measured 255 (bright content lifted into
  // clipping). Ceiling 120 sits ~54 above the fixed measurement and 135 below
  // the buggy one, so only a real geometry regression crosses it; lift floor
  // base+15 is half the measured delta, so it fails only if the region stops
  // applying altogether.
  it("crop alignment: a masked lift on a cropped frame contains only cropped-frame content", async (ctx) => {
    requireWebGPU(ctx);
    const { bitmap, objectUrl } = await makeColumnCard(darkCenterBandFill);
    try {
      const { base, adjusted } = await renderCropPair(bitmap, objectUrl, "local-geo-crop");

      // premise: the cropped base frame is uniformly dark band content
      expect(meanOf(base, LEFT_STRIP)).toBeLessThan(80);
      expect(meanOf(base, RIGHT_STRIP)).toBeLessThan(80);

      const baseMask = meanOf(base, CROP_MASK_RECT);
      const adjustedMask = meanOf(adjusted, CROP_MASK_RECT);
      expect(adjustedMask).toBeGreaterThan(baseMask + 15);
      expect(adjustedMask).toBeLessThan(120);
    } finally {
      URL.revokeObjectURL(objectUrl);
      bitmap.close();
    }
  });

  // Same crop scenario: the blend factor is mask alpha x amount, so outside
  // the ellipse the adjusted render must equal the unadjusted render exactly.
  // Measured deltas under SwiftShader are 0 at every probe rect; the spec
  // tolerance is ±3 to absorb GPU float drift only.
  it("outside the mask the adjusted render is identical to the unadjusted render", async (ctx) => {
    requireWebGPU(ctx);
    const { bitmap, objectUrl } = await makeColumnCard(darkCenterBandFill);
    try {
      const { base, adjusted } = await renderCropPair(bitmap, objectUrl, "local-geo-identity");

      const outsideRects = [
        { x0: 2, y0: 2, x1: 6, y1: 6 },
        { x0: 121, y0: 2, x1: 125, y1: 6 },
        { x0: 2, y0: 121, x1: 6, y1: 125 },
        { x0: 121, y0: 121, x1: 125, y1: 125 },
        { x0: 48, y0: 104, x1: 80, y1: 120 },
        { x0: 64, y0: 54, x1: 96, y1: 74 },
      ];
      for (const rect of outsideRects) {
        expect(Math.abs(meanOf(adjusted, rect) - meanOf(base, rect))).toBeLessThanOrEqual(3);
      }
    } finally {
      URL.revokeObjectURL(objectUrl);
      bitmap.close();
    }
  });

  // flipHorizontal on the left-dark/right-bright card turns the output's right
  // half dark (premise strips measured 242.2 left vs 34.4 right). The masked
  // +2 EV lift at output u=0.8 must hit that flipped dark half: fixed chain
  // measured 66.2 (base 34.4, delta +31.8). The pre-fix chain ignored the
  // flip, so u=0.8 sampled the source's bright right half; buggy-equivalent
  // probe measured 255. Same anchor rationale as the crop case.
  it("flip alignment: a masked lift under flipHorizontal hits the flipped dark half", async (ctx) => {
    requireWebGPU(ctx);
    const { bitmap, objectUrl } = await makeColumnCard(leftDarkFill);
    try {
      const base = await renderScenario({
        bitmap,
        objectUrl,
        id: "local-geo-flip-base",
        mutateState: applyFlipGeometry,
      });
      const adjusted = await renderScenario({
        bitmap,
        objectUrl,
        id: "local-geo-flip-adjusted",
        mutateState: (state) => {
          applyFlipGeometry(state);
          addRadialExposureRegion(state, "flip-region", FLIP_MASK);
        },
      });

      // premise: flip applied — output left half is the bright source half,
      // right half (where the mask sits) is the dark one
      expect(meanOf(base, LEFT_STRIP)).toBeGreaterThan(200);
      expect(meanOf(base, RIGHT_STRIP)).toBeLessThan(80);

      const baseMask = meanOf(base, FLIP_MASK_RECT);
      const adjustedMask = meanOf(adjusted, FLIP_MASK_RECT);
      expect(adjustedMask).toBeGreaterThan(baseMask + 15);
      expect(adjustedMask).toBeLessThan(120);
    } finally {
      URL.revokeObjectURL(objectUrl);
      bitmap.close();
    }
  });
});
