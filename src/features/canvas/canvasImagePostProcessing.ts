import type { EditingAdjustments } from "@/types";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const hasCanvasImagePostProcessing = (adjustments: EditingAdjustments) =>
  Math.abs(adjustments.brightness ?? 0) > 0.001 ||
  Math.abs(adjustments.hue ?? 0) > 0.001 ||
  (adjustments.blur ?? 0) > 0.001 ||
  (adjustments.dilate ?? 0) > 0.001;

const resolveBlurRadiusPx = (value: number, shortEdge: number) =>
  (clamp(value, 0, 100) / 100) * Math.max(1, Math.min(18, shortEdge * 0.03));

const resolveDilateRadiusPx = (value: number, shortEdge: number) =>
  Math.round((clamp(value, 0, 100) / 100) * Math.max(1, Math.min(4, shortEdge * 0.006)));

export const applyCanvasImagePostProcessing = (
  canvas: HTMLCanvasElement,
  adjustments: EditingAdjustments
) => {
  if (!hasCanvasImagePostProcessing(adjustments) || canvas.width <= 0 || canvas.height <= 0) {
    return;
  }

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return;
  }

  const scratchCanvas = document.createElement("canvas");
  scratchCanvas.width = canvas.width;
  scratchCanvas.height = canvas.height;
  const scratchContext = scratchCanvas.getContext("2d", { willReadFrequently: true });
  if (!scratchContext) {
    scratchCanvas.width = 0;
    scratchCanvas.height = 0;
    return;
  }

  const copyCanvasToScratch = () => {
    scratchContext.clearRect(0, 0, scratchCanvas.width, scratchCanvas.height);
    scratchContext.drawImage(canvas, 0, 0);
  };

  try {
    copyCanvasToScratch();

    const shortEdge = Math.min(canvas.width, canvas.height);
    const filterParts: string[] = [];
    const brightness = clamp(adjustments.brightness ?? 0, -100, 100);
    const hue = clamp(adjustments.hue ?? 0, -100, 100);
    const blur = clamp(adjustments.blur ?? 0, 0, 100);

    if (Math.abs(brightness) > 0.001) {
      filterParts.push(`brightness(${100 + brightness}%)`);
    }
    if (Math.abs(hue) > 0.001) {
      filterParts.push(`hue-rotate(${(hue / 100) * 180}deg)`);
    }
    if (blur > 0.001) {
      filterParts.push(`blur(${resolveBlurRadiusPx(blur, shortEdge).toFixed(2)}px)`);
    }

    if (filterParts.length > 0) {
      context.save();
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.filter = filterParts.join(" ");
      context.drawImage(scratchCanvas, 0, 0);
      context.restore();
      copyCanvasToScratch();
    }

    const dilateRadius = resolveDilateRadiusPx(adjustments.dilate ?? 0, shortEdge);
    if (dilateRadius > 0) {
      context.save();
      context.clearRect(0, 0, canvas.width, canvas.height);
      let isFirstPass = true;
      for (let y = -dilateRadius; y <= dilateRadius; y += 1) {
        for (let x = -dilateRadius; x <= dilateRadius; x += 1) {
          context.globalCompositeOperation = isFirstPass ? "source-over" : "lighten";
          context.drawImage(scratchCanvas, x, y);
          isFirstPass = false;
        }
      }
      context.restore();
    }
  } finally {
    scratchCanvas.width = 0;
    scratchCanvas.height = 0;
  }
};
