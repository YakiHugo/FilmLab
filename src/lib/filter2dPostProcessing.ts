import {
  clampFilter2dValue as clamp,
  hasFilter2dPostProcessing,
  resolveBlurRadiusPx,
  resolveDilateRadiusPx,
  type Filter2dPostProcessingParams,
} from "@/lib/filter2dShared";

export type { Filter2dPostProcessingParams } from "@/lib/filter2dShared";
export { hasFilter2dPostProcessing } from "@/lib/filter2dShared";

export const applyFilter2dPostProcessing = (
  canvas: HTMLCanvasElement,
  params: Filter2dPostProcessingParams
) => {
  if (!hasFilter2dPostProcessing(params) || canvas.width <= 0 || canvas.height <= 0) {
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
    const brightness = clamp(params.brightness, -100, 100);
    const hue = clamp(params.hue, -100, 100);
    const blur = clamp(params.blur, 0, 100);

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

    const dilateRadius = resolveDilateRadiusPx(params.dilate, shortEdge);
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
