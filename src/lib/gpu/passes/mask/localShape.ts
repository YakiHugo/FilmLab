import type { GPURenderPassDescriptor } from "../types";
import type { LocalAdjustmentMask } from "@/types";
import { clamp } from "@/lib/math";
import { requestGPUContext } from "../../context";
import {
  TexturePool,
  readbackTextureRGBA8,
} from "../../resources";
import { ShaderCache } from "../../shaders";
import { PipelineExecutor, type PipelineInputSource } from "../../pipeline";
import { createPerDeviceCache } from "../../perDeviceCache";
import {
  createRenderSurfaceHandle,
  createEmptyRenderBoundaryMetrics,
  type RenderSurfaceHandle,
} from "@/lib/renderSurfaceHandle";
import type { RenderMode } from "@/lib/renderer/RenderManager";

import {
  LinearGradientPipelineCache,
  createLinearGradientPass,
  type LinearGradientPassHandle,
} from "./linearGradient";
import {
  RadialGradientPipelineCache,
  createRadialGradientPass,
  type RadialGradientPassHandle,
} from "./radialGradient";
import {
  BrushStampPipelineCache,
  createBrushStampPass,
  type BrushStampPassHandle,
} from "./brushStamp";
import {
  MaskInvertPipelineCache,
  createMaskInvertPass,
} from "./maskInvert";

const GPU_BRUSH_MASK_MAX_POINTS = 512;
const OUTPUT_FORMAT: GPUTextureFormat = "rgba8unorm";

const getCache = createPerDeviceCache((device) => {
  const shaders = new ShaderCache(device);
  return {
    shaders,
    linearGradient: new LinearGradientPipelineCache(device, shaders),
    radialGradient: new RadialGradientPipelineCache(device, shaders),
    brushStamp: new BrushStampPipelineCache(device, shaders),
    maskInvert: new MaskInvertPipelineCache(device, shaders),
  };
});

const createTransparent1x1Texture = (device: GPUDevice): GPUTexture => {
  const texture = device.createTexture({
    label: "localShape:emptyInput",
    size: { width: 1, height: 1 },
    format: OUTPUT_FORMAT,
    usage:
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.TEXTURE_BINDING,
  });
  device.queue.writeTexture(
    { texture },
    new Uint8Array([0, 0, 0, 0]),
    { bytesPerRow: 4 },
    { width: 1, height: 1 }
  );
  return texture;
};

const writePixelsToCanvas = (
  pixels: Uint8Array,
  width: number,
  height: number
): HTMLCanvasElement | null => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.putImageData(
    new ImageData(new Uint8ClampedArray(pixels), width, height),
    0,
    0
  );
  return canvas;
};

export interface ApplyLocalMaskShapeOnSurfaceOptions {
  width: number;
  height: number;
  mask: LocalAdjustmentMask;
  slotId?: string;
  mode?: RenderMode;
  fullWidth?: number;
  fullHeight?: number;
  offsetX?: number;
  offsetY?: number;
}

export const applyLocalMaskShapeOnSurface = async ({
  width,
  height,
  mask,
  slotId = "local-mask-shape",
  mode = "preview",
  fullWidth: rawFullWidth,
  fullHeight: rawFullHeight,
  offsetX = 0,
  offsetY = 0,
}: ApplyLocalMaskShapeOnSurfaceOptions): Promise<RenderSurfaceHandle | null> => {
  const targetWidth = Math.max(1, Math.round(width));
  const targetHeight = Math.max(1, Math.round(height));
  const fullWidth = Math.max(1, Math.round(rawFullWidth ?? targetWidth));
  const fullHeight = Math.max(1, Math.round(rawFullHeight ?? targetHeight));

  // Caller contract: `null` means "decline GPU path, fall back to CPU draw".
  // effectMask.ts / imageProcessing.ts both rely on this for oversized brushes.
  if (mask.mode === "brush" && mask.points.length > GPU_BRUSH_MASK_MAX_POINTS) {
    return null;
  }

  if (
    mask.mode === "brush" &&
    mask.points.length === 0 &&
    !mask.invert
  ) {
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const c2d = canvas.getContext("2d");
    if (!c2d) return null;
    return createRenderSurfaceHandle({
      kind: "owned-canvas",
      mode,
      slotId,
      sourceCanvas: canvas,
      metrics: createEmptyRenderBoundaryMetrics(),
    });
  }

  const ctx = await requestGPUContext();
  const { device } = ctx;
  const caches = getCache(device);
  const pool = new TexturePool(device);
  let inputTexture: GPUTexture | null = null;
  const handles: { destroy?: () => void }[] = [];

  try {
    inputTexture = createTransparent1x1Texture(device);
    const inputView = inputTexture.createView({ label: "localShape:emptyInputView" });
    const sampler = device.createSampler({
      minFilter: "linear",
      magFilter: "linear",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
    });
    const executor = new PipelineExecutor({ device, texturePool: pool, defaultSampler: sampler });

    const passes: GPURenderPassDescriptor[] = [];

    if (mask.mode === "brush") {
      const minDimension = Math.max(1, Math.min(fullWidth, fullHeight));
      const brushSizePx = Math.max(1, clamp(mask.brushSize, 0.005, 0.25) * minDimension);
      const feather = clamp(mask.feather, 0, 1);
      const flow = clamp(mask.flow, 0.05, 1);
      mask.points.forEach((point, index) => {
        const pressure = clamp(point.pressure ?? 1, 0.1, 1);
        const radiusPx = Math.max(1, brushSizePx * pressure);
        const handle: BrushStampPassHandle = createBrushStampPass(device, caches.brushStamp, {
          outputFormat: OUTPUT_FORMAT,
          params: {
            canvasWidth: targetWidth,
            canvasHeight: targetHeight,
            centerPxX: clamp(point.x, 0, 1) * fullWidth - offsetX,
            centerPxY: clamp(point.y, 0, 1) * fullHeight - offsetY,
            radiusPx,
            innerRadiusPx: Math.max(0, radiusPx * (1 - feather)),
            flow,
          },
          id: `local-mask-shape-brush-${index}`,
        });
        handles.push(handle);
        passes.push(handle.descriptor);
      });
    } else {
      const localX = (value: number) =>
        (clamp(value, 0, 1) * fullWidth - offsetX) / targetWidth;
      const localY = (value: number) =>
        (clamp(value, 0, 1) * fullHeight - offsetY) / targetHeight;
      if (mask.mode === "linear") {
        const startX = localX(mask.startX);
        const startY = localY(mask.startY);
        const endX = localX(mask.endX);
        let endY = localY(mask.endY);
        if ((endX - startX) ** 2 + (endY - startY) ** 2 < 1e-6) {
          endY += 1 / targetHeight;
        }
        const handle: LinearGradientPassHandle = createLinearGradientPass(
          device,
          caches.linearGradient,
          {
            outputFormat: OUTPUT_FORMAT,
            params: {
              start: [startX, startY],
              end: [endX, endY],
              feather: clamp(mask.feather, 0, 1),
              // Invert is handled by the trailing maskInvert pass below.
              invert: false,
            },
            id: "local-mask-shape-linear",
          }
        );
        handles.push(handle);
        passes.push(handle.descriptor);
      } else {
        const handle: RadialGradientPassHandle = createRadialGradientPass(
          device,
          caches.radialGradient,
          {
            outputFormat: OUTPUT_FORMAT,
            params: {
              center: [localX(mask.centerX), localY(mask.centerY)],
              radius: [
                (Math.max(0.01, mask.radiusX) * fullWidth) / targetWidth,
                (Math.max(0.01, mask.radiusY) * fullHeight) / targetHeight,
              ],
              feather: clamp(mask.feather, 0, 1),
              invert: false,
            },
            id: "local-mask-shape-radial",
          }
        );
        handles.push(handle);
        passes.push(handle.descriptor);
      }
    }

    if (mask.invert) {
      passes.push(
        createMaskInvertPass(caches.maskInvert, {
          outputFormat: OUTPUT_FORMAT,
          id: "local-mask-shape-invert",
        })
      );
    }

    const srcInput: PipelineInputSource = {
      texture: inputTexture,
      view: inputView,
      width: 1,
      height: 1,
      format: OUTPUT_FORMAT,
      lease: null,
    };

    const result = executor.execute({
      passes,
      input: srcInput,
      baseWidth: targetWidth,
      baseHeight: targetHeight,
    });
    if (result.kind !== "texture") return null;

    const pixels = await readbackTextureRGBA8(
      device,
      result.output.texture,
      targetWidth,
      targetHeight
    );
    result.output.release();

    const canvas = writePixelsToCanvas(pixels, targetWidth, targetHeight);
    if (!canvas) return null;

    const metrics = createEmptyRenderBoundaryMetrics();
    metrics.cpuPixelReads += 1;

    return createRenderSurfaceHandle({
      kind: "owned-canvas",
      mode,
      slotId,
      sourceCanvas: canvas,
      metrics,
    });
  } finally {
    for (const handle of handles) {
      handle.destroy?.();
    }
    inputTexture?.destroy();
    pool.dispose();
  }
};
