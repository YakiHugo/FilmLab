import { applyFilter2dPostProcessing, hasFilter2dPostProcessing } from "@/lib/filter2dPostProcessing";
import type { EditingAdjustments } from "@/types";

const hasCanvasImagePostProcessing = (adjustments: EditingAdjustments) =>
  hasFilter2dPostProcessing({
    brightness: adjustments.brightness ?? 0,
    hue: adjustments.hue ?? 0,
    blur: adjustments.blur ?? 0,
    dilate: adjustments.dilate ?? 0,
  });

export const applyCanvasImagePostProcessing = (
  canvas: HTMLCanvasElement,
  adjustments: EditingAdjustments
) => {
  if (!hasCanvasImagePostProcessing(adjustments) || canvas.width <= 0 || canvas.height <= 0) {
    return;
  }
  applyFilter2dPostProcessing(canvas, {
    brightness: adjustments.brightness ?? 0,
    hue: adjustments.hue ?? 0,
    blur: adjustments.blur ?? 0,
    dilate: adjustments.dilate ?? 0,
  });
};
