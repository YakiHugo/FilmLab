import { clamp } from "@/lib/math";
import {
  hasLocalMaskRangeConstraints,
  resolveHueSatFromRgb,
  resolveLocalMaskColorRange,
  resolveLocalMaskColorWeight,
  resolveLocalMaskLumaRange,
  resolveLocalMaskLumaWeight,
} from "@/lib/localMaskShared";
import { applyLocalMaskRangeOnGpu } from "@/lib/renderer/gpuLocalMaskRangeGate";
import { applyLocalMaskRangeOnGpuToSurface } from "@/lib/renderer/gpuLocalMaskRangeGate";
import { renderLocalMaskShapeOnGpuToSurface } from "@/lib/renderer/gpuLocalMaskShape";
import type { LocalAdjustmentMask } from "@/types";
import type { ImageRenderMaskDefinition } from "./types";

const ensureCanvasSize = (canvas: HTMLCanvasElement, width: number, height: number) => {
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  if (canvas.width !== safeWidth) {
    canvas.width = safeWidth;
  }
  if (canvas.height !== safeHeight) {
    canvas.height = safeHeight;
  }
};

const hashString = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
};

const drawLocalMaskShape = (
  context: CanvasRenderingContext2D,
  mask: LocalAdjustmentMask,
  width: number,
  height: number
) => {
  if (mask.mode === "brush") {
    const minDimension = Math.max(1, Math.min(width, height));
    const brushSizePx = Math.max(1, clamp(mask.brushSize, 0.005, 0.25) * minDimension);
    const feather = clamp(mask.feather, 0, 1);
    const flow = clamp(mask.flow, 0.05, 1);
    if (mask.points.length === 0) {
      return;
    }
    for (const point of mask.points) {
      const px = clamp(point.x, 0, 1) * width;
      const py = clamp(point.y, 0, 1) * height;
      const pressure = clamp(point.pressure ?? 1, 0.1, 1);
      const radius = Math.max(1, brushSizePx * pressure);
      if (feather <= 0.001) {
        context.fillStyle = `rgba(255,255,255,${flow})`;
      } else {
        const innerRadius = Math.max(0, radius * (1 - feather));
        const gradient = context.createRadialGradient(px, py, innerRadius, px, py, radius);
        gradient.addColorStop(0, `rgba(255,255,255,${flow})`);
        gradient.addColorStop(1, "rgba(255,255,255,0)");
        context.fillStyle = gradient;
      }
      context.beginPath();
      context.arc(px, py, radius, 0, Math.PI * 2);
      context.closePath();
      context.fill();
    }
    return;
  }

  if (mask.mode === "radial") {
    const centerX = clamp(mask.centerX, 0, 1) * width;
    const centerY = clamp(mask.centerY, 0, 1) * height;
    const radiusX = Math.max(1, clamp(mask.radiusX, 0.01, 1) * width);
    const radiusY = Math.max(1, clamp(mask.radiusY, 0.01, 1) * height);
    const feather = clamp(mask.feather, 0, 1);

    context.save();
    context.translate(centerX, centerY);
    context.scale(radiusX, radiusY);
    if (feather <= 0.001) {
      context.fillStyle = "rgba(255,255,255,1)";
    } else {
      const innerRadius = Math.max(0, 1 - feather);
      const gradient = context.createRadialGradient(0, 0, innerRadius, 0, 0, 1);
      gradient.addColorStop(0, "rgba(255,255,255,1)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      context.fillStyle = gradient;
    }
    context.beginPath();
    context.arc(0, 0, 1, 0, Math.PI * 2);
    context.closePath();
    context.fill();
    context.restore();
    return;
  }

  const startX = clamp(mask.startX, 0, 1) * width;
  const startY = clamp(mask.startY, 0, 1) * height;
  const endX = clamp(mask.endX, 0, 1) * width;
  let endY = clamp(mask.endY, 0, 1) * height;
  if ((endX - startX) * (endX - startX) + (endY - startY) * (endY - startY) < 1e-6) {
    endY += 1;
  }
  const feather = clamp(mask.feather, 0, 1);
  const gradient = context.createLinearGradient(startX, startY, endX, endY);
  if (feather <= 0.001) {
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.499, "rgba(255,255,255,1)");
    gradient.addColorStop(0.501, "rgba(255,255,255,0)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
  } else {
    const transitionStart = clamp(0.5 - feather * 0.5, 0, 1);
    const transitionEnd = clamp(0.5 + feather * 0.5, 0, 1);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(transitionStart, "rgba(255,255,255,1)");
    gradient.addColorStop(transitionEnd, "rgba(255,255,255,0)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
  }
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
};

const applyLocalMaskLumaAndColorRange = (
  maskContext: CanvasRenderingContext2D,
  referenceContext: CanvasRenderingContext2D,
  mask: LocalAdjustmentMask,
  width: number,
  height: number
) => {
  const lumaRange = resolveLocalMaskLumaRange(mask);
  const colorRange = resolveLocalMaskColorRange(mask);
  const hasLumaRange = !(lumaRange.min <= 0.0001 && lumaRange.max >= 0.9999);
  const hasColorRange = !(colorRange.hueRange >= 179.999 && colorRange.satMin <= 1e-4);
  if (!hasLumaRange && !hasColorRange) {
    return;
  }

  const maskImage = maskContext.getImageData(0, 0, width, height);
  const sourceImage = referenceContext.getImageData(0, 0, width, height);
  const maskPixels = maskImage.data;
  const sourcePixels = sourceImage.data;

  for (let index = 0; index < maskPixels.length; index += 4) {
    const alpha = maskPixels[index + 3] ?? 0;
    if (alpha <= 0) {
      continue;
    }
    const red = (sourcePixels[index] ?? 0) / 255;
    const green = (sourcePixels[index + 1] ?? 0) / 255;
    const blue = (sourcePixels[index + 2] ?? 0) / 255;
    let weight = 1;

    if (hasLumaRange) {
      const luma = red * 0.2126 + green * 0.7152 + blue * 0.0722;
      weight *= resolveLocalMaskLumaWeight(luma, lumaRange);
    }

    if (weight > 1e-4 && hasColorRange) {
      const hueSat = resolveHueSatFromRgb(red, green, blue);
      weight *= resolveLocalMaskColorWeight(hueSat.hue, hueSat.sat, colorRange);
    }

    maskPixels[index + 3] = Math.round(alpha * weight);
  }

  maskContext.putImageData(maskImage, 0, 0);
};

export const buildImageRenderMaskRevisionKey = (
  maskDefinition: ImageRenderMaskDefinition | null | undefined
) => {
  if (!maskDefinition) {
    return "none";
  }
  return hashString(
    JSON.stringify({
      id: maskDefinition.id,
      kind: maskDefinition.kind,
      sourceLocalAdjustmentId: maskDefinition.sourceLocalAdjustmentId,
      mask: maskDefinition.mask,
    })
  );
};

export const renderImageEffectMaskToCanvas = async ({
  height,
  maskDefinition,
  referenceSource,
  scratchCanvas,
  targetCanvas,
  width,
}: {
  width: number;
  height: number;
  maskDefinition: ImageRenderMaskDefinition;
  referenceSource?: CanvasImageSource;
  targetCanvas?: HTMLCanvasElement;
  scratchCanvas?: HTMLCanvasElement;
}) => {
  const output = targetCanvas ?? document.createElement("canvas");
  ensureCanvasSize(output, width, height);
  const outputContext = output.getContext("2d", { willReadFrequently: true });
  if (!outputContext) {
    return null;
  }
  outputContext.clearRect(0, 0, width, height);

  let maskSurface = await renderLocalMaskShapeOnGpuToSurface({
    width,
    height,
    mask: maskDefinition.mask,
    slotId: `effect-mask-shape:${maskDefinition.id}`,
  });
  if (!maskSurface) {
    if (maskDefinition.mask.invert) {
      outputContext.fillStyle = "rgba(255,255,255,1)";
      outputContext.fillRect(0, 0, width, height);
      outputContext.globalCompositeOperation = "destination-out";
      drawLocalMaskShape(outputContext, maskDefinition.mask, width, height);
      outputContext.globalCompositeOperation = "source-over";
    } else {
      drawLocalMaskShape(outputContext, maskDefinition.mask, width, height);
    }
  }

  let needsCpuRangeFallback = false;
  if (referenceSource && hasLocalMaskRangeConstraints(maskDefinition.mask)) {
    if (maskSurface) {
      const gatedSurface = await applyLocalMaskRangeOnGpuToSurface({
        referenceSource,
        maskSource: maskSurface.sourceCanvas,
        width,
        height,
        mask: maskDefinition.mask,
        slotId: `effect-mask:${maskDefinition.id}`,
      });
      if (gatedSurface) {
        maskSurface = gatedSurface;
      } else {
        needsCpuRangeFallback = true;
      }
    } else {
      const appliedOnGpu = await applyLocalMaskRangeOnGpu({
        maskCanvas: output,
        referenceSource,
        mask: maskDefinition.mask,
        slotId: `effect-mask:${maskDefinition.id}`,
      });
      if (appliedOnGpu) {
        return output;
      }
      needsCpuRangeFallback = true;
    }
  }

  if (maskSurface) {
    maskSurface.materializeToCanvas(output);
    if (!needsCpuRangeFallback) {
      return output;
    }
  }

  if (referenceSource && needsCpuRangeFallback) {
    const referenceCanvas = scratchCanvas ?? document.createElement("canvas");
    ensureCanvasSize(referenceCanvas, width, height);
    const referenceContext = referenceCanvas.getContext("2d", { willReadFrequently: true });
    if (referenceContext) {
      referenceContext.clearRect(0, 0, width, height);
      referenceContext.drawImage(referenceSource, 0, 0, width, height);
      applyLocalMaskLumaAndColorRange(
        outputContext,
        referenceContext,
        maskDefinition.mask,
        width,
        height
      );
    }
  }

  return output;
};
