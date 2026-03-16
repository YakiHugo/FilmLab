import { clamp } from "@/lib/math";
import type {
  EditorLayerMask,
  LayerBrushMaskData,
  LayerLinearMaskData,
  LayerRadialMaskData,
  LuminosityMaskData,
} from "@/types";

interface GenerateMaskTextureOptions {
  width: number;
  height: number;
  referenceSource?: CanvasImageSource;
  targetCanvas?: HTMLCanvasElement;
  scratchCanvas?: HTMLCanvasElement;
}

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

const smoothstep = (edge0: number, edge1: number, x: number) => {
  if (Math.abs(edge1 - edge0) < 1e-6) {
    return x >= edge1 ? 1 : 0;
  }
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

const drawBrushMask = (
  context: CanvasRenderingContext2D,
  maskData: LayerBrushMaskData,
  width: number,
  height: number
) => {
  const minDimension = Math.max(1, Math.min(width, height));
  const brushSizePx = Math.max(1, Math.max(0.005, maskData.brushSize) * minDimension);
  const feather = clamp(maskData.feather, 0, 1);
  const flow = clamp(maskData.flow, 0.05, 1);

  if (maskData.points.length === 0) {
    return;
  }

  for (const point of maskData.points) {
    const px = point.x * width;
    const py = point.y * height;
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
};

const drawRadialMask = (
  context: CanvasRenderingContext2D,
  maskData: LayerRadialMaskData,
  width: number,
  height: number
) => {
  const centerX = maskData.centerX * width;
  const centerY = maskData.centerY * height;
  const radiusX = Math.max(1, Math.max(0.01, maskData.radiusX) * width);
  const radiusY = Math.max(1, Math.max(0.01, maskData.radiusY) * height);
  const feather = clamp(maskData.feather, 0, 1);

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
};

const drawLinearMask = (
  context: CanvasRenderingContext2D,
  maskData: LayerLinearMaskData,
  width: number,
  height: number
) => {
  const startX = maskData.startX * width;
  const startY = maskData.startY * height;
  const endX = maskData.endX * width;
  let endY = maskData.endY * height;
  if ((endX - startX) * (endX - startX) + (endY - startY) * (endY - startY) < 1e-6) {
    endY += 1;
  }

  const feather = clamp(maskData.feather, 0, 1);
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

const drawLuminosityMask = (
  context: CanvasRenderingContext2D,
  maskData: LuminosityMaskData,
  width: number,
  height: number,
  referenceSource: CanvasImageSource,
  scratchCanvas: HTMLCanvasElement
) => {
  ensureCanvasSize(scratchCanvas, width, height);
  const scratchContext = scratchCanvas.getContext("2d", { willReadFrequently: true });
  if (!scratchContext) {
    return;
  }
  scratchContext.clearRect(0, 0, width, height);
  scratchContext.drawImage(referenceSource, 0, 0, width, height);
  const sourceImage = scratchContext.getImageData(0, 0, width, height);
  const outputImage = context.getImageData(0, 0, width, height);
  const sourcePixels = sourceImage.data;
  const outputPixels = outputImage.data;

  const min = clamp(maskData.thresholdMin, 0, 1);
  const max = clamp(maskData.thresholdMax, 0, 1);
  const minThreshold = Math.min(min, max);
  const maxThreshold = Math.max(min, max);
  const feather = clamp(maskData.feather, 0, 1);

  for (let index = 0; index < sourcePixels.length; index += 4) {
    const r = (sourcePixels[index] ?? 0) / 255;
    const g = (sourcePixels[index + 1] ?? 0) / 255;
    const b = (sourcePixels[index + 2] ?? 0) / 255;
    const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;

    let weight = 1;
    if (luma < minThreshold) {
      weight =
        feather <= 1e-4
          ? 0
          : smoothstep(Math.max(0, minThreshold - feather), minThreshold, luma);
    } else if (luma > maxThreshold) {
      weight =
        feather <= 1e-4
          ? 0
          : 1 - smoothstep(maxThreshold, Math.min(1, maxThreshold + feather), luma);
    }

    outputPixels[index] = 255;
    outputPixels[index + 1] = 255;
    outputPixels[index + 2] = 255;
    outputPixels[index + 3] = Math.round(clamp(weight, 0, 1) * 255);
  }

  context.putImageData(outputImage, 0, 0);
};

const invertMaskAlpha = (context: CanvasRenderingContext2D, width: number, height: number) => {
  const image = context.getImageData(0, 0, width, height);
  const pixels = image.data;
  for (let index = 3; index < pixels.length; index += 4) {
    pixels[index] = 255 - (pixels[index] ?? 0);
  }
  context.putImageData(image, 0, 0);
};

export const generateMaskTexture = (
  mask: EditorLayerMask | undefined,
  options: GenerateMaskTextureOptions
): HTMLCanvasElement | null => {
  if (!mask) {
    return null;
  }
  const width = Math.max(1, Math.round(options.width));
  const height = Math.max(1, Math.round(options.height));
  const maskCanvas = options.targetCanvas ?? document.createElement("canvas");
  ensureCanvasSize(maskCanvas, width, height);
  const context = maskCanvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return null;
  }

  context.clearRect(0, 0, width, height);

  if (mask.mode === "brush") {
    if (mask.data && "mode" in mask.data && mask.data.mode === "brush") {
      drawBrushMask(context, mask.data, width, height);
    }
  } else if (mask.mode === "radial") {
    if (mask.data && "mode" in mask.data && mask.data.mode === "radial") {
      drawRadialMask(context, mask.data, width, height);
    }
  } else if (mask.mode === "linear") {
    if (mask.data && "mode" in mask.data && mask.data.mode === "linear") {
      drawLinearMask(context, mask.data, width, height);
    }
  } else if (options.referenceSource) {
    const data: LuminosityMaskData = {
      thresholdMin:
        mask.data && "thresholdMin" in mask.data && typeof mask.data.thresholdMin === "number"
          ? mask.data.thresholdMin
          : 0,
      thresholdMax:
        mask.data && "thresholdMax" in mask.data && typeof mask.data.thresholdMax === "number"
          ? mask.data.thresholdMax
          : 1,
      feather:
        mask.data && "feather" in mask.data && typeof mask.data.feather === "number"
          ? mask.data.feather
          : 0.25,
    };
    const scratchCanvas = options.scratchCanvas ?? document.createElement("canvas");
    drawLuminosityMask(
      context,
      data,
      width,
      height,
      options.referenceSource,
      scratchCanvas
    );
  }

  if (mask.inverted) {
    invertMaskAlpha(context, width, height);
  }

  return maskCanvas;
};

export const applyMaskToLayerCanvas = (
  source: CanvasImageSource,
  maskCanvas: HTMLCanvasElement,
  options: {
    width: number;
    height: number;
    targetCanvas?: HTMLCanvasElement;
  }
): HTMLCanvasElement => {
  const width = Math.max(1, Math.round(options.width));
  const height = Math.max(1, Math.round(options.height));
  const output = options.targetCanvas ?? document.createElement("canvas");
  ensureCanvasSize(output, width, height);
  const context = output.getContext("2d", { willReadFrequently: true });
  if (!context) {
    if (typeof HTMLCanvasElement !== "undefined" && source instanceof HTMLCanvasElement) {
      return source;
    }
    return output;
  }
  context.clearRect(0, 0, width, height);
  context.drawImage(source, 0, 0, width, height);
  context.globalCompositeOperation = "destination-in";
  context.drawImage(maskCanvas, 0, 0, width, height);
  context.globalCompositeOperation = "source-over";
  return output;
};
