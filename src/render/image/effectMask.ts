import { clamp } from "@/lib/math";
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

const smoothstep = (edge0: number, edge1: number, x: number) => {
  if (Math.abs(edge1 - edge0) < 1e-6) {
    return x >= edge1 ? 1 : 0;
  }
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
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

const resolveLocalMaskLumaRange = (mask: LocalAdjustmentMask) => {
  const min = clamp(mask.lumaMin ?? 0, 0, 1);
  const max = clamp(mask.lumaMax ?? 1, 0, 1);
  return {
    min: Math.min(min, max),
    max: Math.max(min, max),
    feather: clamp(mask.lumaFeather ?? 0, 0, 1),
  };
};

const resolveLocalMaskColorRange = (mask: LocalAdjustmentMask) => ({
  hueCenter: (((mask.hueCenter ?? 0) % 360) + 360) % 360,
  hueRange: clamp(mask.hueRange ?? 180, 0, 180),
  hueFeather: clamp(mask.hueFeather ?? 0, 0, 180),
  satMin: clamp(mask.satMin ?? 0, 0, 1),
  satFeather: clamp(mask.satFeather ?? 0, 0, 1),
});

const resolveHueDistance = (a: number, b: number) => {
  const delta = Math.abs(a - b) % 360;
  return delta > 180 ? 360 - delta : delta;
};

const resolveHueSatFromRgb = (r: number, g: number, b: number) => {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const diff = max - min;
  const sat = max <= 1e-6 ? 0 : diff / max;
  if (diff <= 1e-6) {
    return { hue: 0, sat };
  }

  let hue: number;
  if (max === r) {
    hue = ((g - b) / diff) % 6;
  } else if (max === g) {
    hue = (b - r) / diff + 2;
  } else {
    hue = (r - g) / diff + 4;
  }
  hue *= 60;
  if (hue < 0) {
    hue += 360;
  }
  return {
    hue,
    sat,
  };
};

const resolveLocalMaskLumaWeight = (
  luma: number,
  range: { min: number; max: number; feather: number }
) => {
  if (luma < range.min) {
    if (range.feather <= 1e-4) {
      return 0;
    }
    return smoothstep(range.min - range.feather, range.min, luma);
  }
  if (luma > range.max) {
    if (range.feather <= 1e-4) {
      return 0;
    }
    return 1 - smoothstep(range.max, range.max + range.feather, luma);
  }
  return 1;
};

const resolveLocalMaskColorWeight = (
  hue: number,
  sat: number,
  range: {
    hueCenter: number;
    hueRange: number;
    hueFeather: number;
    satMin: number;
    satFeather: number;
  }
) => {
  let hueWeight = 1;
  if (range.hueRange < 179.999) {
    if (sat <= 1e-3) {
      return 0;
    }
    const distance = resolveHueDistance(hue, range.hueCenter);
    if (distance <= range.hueRange) {
      hueWeight = 1;
    } else if (range.hueFeather <= 1e-4) {
      hueWeight = 0;
    } else {
      hueWeight =
        1 - smoothstep(range.hueRange, Math.min(180, range.hueRange + range.hueFeather), distance);
    }
  }

  let satWeight = 1;
  if (range.satMin > 1e-4) {
    if (range.satFeather <= 1e-4) {
      satWeight = sat >= range.satMin ? 1 : 0;
    } else {
      satWeight = smoothstep(range.satMin, Math.min(1, range.satMin + range.satFeather), sat);
    }
  }

  return hueWeight * satWeight;
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

export const renderImageEffectMaskToCanvas = ({
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

  if (maskDefinition.mask.invert) {
    outputContext.fillStyle = "rgba(255,255,255,1)";
    outputContext.fillRect(0, 0, width, height);
    outputContext.globalCompositeOperation = "destination-out";
    drawLocalMaskShape(outputContext, maskDefinition.mask, width, height);
    outputContext.globalCompositeOperation = "source-over";
  } else {
    drawLocalMaskShape(outputContext, maskDefinition.mask, width, height);
  }

  if (referenceSource) {
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
