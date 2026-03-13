import type { PreviewRoi } from "@/lib/previewRoi";
import { transformLocalAdjustmentMaskForPreviewRoi } from "@/lib/previewRoi";
import type { LocalAdjustment, LocalAdjustmentMask } from "@/types";
import type { BrushMaskPreviewState } from "./useBrushMaskPainting";

const OVERLAY_FILL = "rgba(56, 189, 248, 0.22)";
const OVERLAY_STROKE = "rgba(186, 230, 253, 0.88)";
const OVERLAY_HANDLE = "rgba(255, 255, 255, 0.92)";

const drawBrushMaskOverlay = (
  context: CanvasRenderingContext2D,
  mask: Extract<LocalAdjustmentMask, { mode: "brush" }>,
  width: number,
  height: number
) => {
  const minDimension = Math.max(1, Math.min(width, height));
  const baseRadius = Math.max(1, Math.max(0.005, mask.brushSize) * minDimension);
  for (const point of mask.points) {
    const radius = Math.max(1, baseRadius * Math.max(0.1, point.pressure ?? 1));
    const centerX = point.x * width;
    const centerY = point.y * height;
    const innerRadius = Math.max(0, radius * (1 - Math.min(1, Math.max(0, mask.feather))));
    const gradient = context.createRadialGradient(
      centerX,
      centerY,
      innerRadius,
      centerX,
      centerY,
      radius
    );
    gradient.addColorStop(0, "rgba(56, 189, 248, 0.34)");
    gradient.addColorStop(1, "rgba(56, 189, 248, 0)");
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.closePath();
    context.fill();
  }
};

const drawRadialMaskOverlay = (
  context: CanvasRenderingContext2D,
  mask: Extract<LocalAdjustmentMask, { mode: "radial" }>,
  width: number,
  height: number
) => {
  const centerX = mask.centerX * width;
  const centerY = mask.centerY * height;
  const radiusX = Math.max(1, Math.max(0.01, mask.radiusX) * width);
  const radiusY = Math.max(1, Math.max(0.01, mask.radiusY) * height);

  context.save();
  context.translate(centerX, centerY);
  context.scale(radiusX, radiusY);
  const gradient = context.createRadialGradient(0, 0, Math.max(0, 1 - mask.feather), 0, 0, 1);
  gradient.addColorStop(0, OVERLAY_FILL);
  gradient.addColorStop(1, "rgba(56, 189, 248, 0)");
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(0, 0, 1, 0, Math.PI * 2);
  context.closePath();
  context.fill();
  context.restore();

  context.strokeStyle = OVERLAY_STROKE;
  context.lineWidth = 1.5;
  context.beginPath();
  context.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
  context.stroke();

  context.fillStyle = OVERLAY_HANDLE;
  context.beginPath();
  context.arc(centerX, centerY, 3, 0, Math.PI * 2);
  context.fill();
}

const drawLinearMaskOverlay = (
  context: CanvasRenderingContext2D,
  mask: Extract<LocalAdjustmentMask, { mode: "linear" }>,
  width: number,
  height: number
) => {
  const startX = mask.startX * width;
  const startY = mask.startY * height;
  const endX = mask.endX * width;
  let endY = mask.endY * height;
  if ((endX - startX) * (endX - startX) + (endY - startY) * (endY - startY) < 1e-6) {
    endY += 1;
  }

  const gradient = context.createLinearGradient(startX, startY, endX, endY);
  gradient.addColorStop(0, OVERLAY_FILL);
  gradient.addColorStop(Math.max(0, 0.5 - mask.feather * 0.5), OVERLAY_FILL);
  gradient.addColorStop(Math.min(1, 0.5 + mask.feather * 0.5), "rgba(56, 189, 248, 0)");
  gradient.addColorStop(1, "rgba(56, 189, 248, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  context.strokeStyle = OVERLAY_STROKE;
  context.lineWidth = 1.5;
  context.beginPath();
  context.moveTo(startX, startY);
  context.lineTo(endX, endY);
  context.stroke();

  context.fillStyle = OVERLAY_HANDLE;
  context.beginPath();
  context.arc(startX, startY, 3, 0, Math.PI * 2);
  context.arc(endX, endY, 3, 0, Math.PI * 2);
  context.fill();
}

export interface DrawLocalMaskOverlayOptions {
  canvas: HTMLCanvasElement;
  frameWidth: number;
  frameHeight: number;
  localAdjustment: LocalAdjustment | null;
  previewRoi: PreviewRoi | null;
  previewState: BrushMaskPreviewState | null;
}

export const drawLocalMaskOverlay = ({
  canvas,
  frameWidth,
  frameHeight,
  localAdjustment,
  previewRoi,
  previewState,
}: DrawLocalMaskOverlayOptions) => {
  const devicePixelRatio = window.devicePixelRatio || 1;
  const targetWidth = Math.max(1, Math.round(frameWidth * devicePixelRatio));
  const targetHeight = Math.max(1, Math.round(frameHeight * devicePixelRatio));
  if (canvas.width !== targetWidth) {
    canvas.width = targetWidth;
  }
  if (canvas.height !== targetHeight) {
    canvas.height = targetHeight;
  }
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  context.clearRect(0, 0, canvas.width, canvas.height);

  if (!localAdjustment) {
    return;
  }

  let mask: LocalAdjustmentMask = localAdjustment.mask;
  if (
    previewState &&
    previewState.maskId === localAdjustment.id &&
    localAdjustment.mask.mode === "brush"
  ) {
    mask = {
      ...localAdjustment.mask,
      points: previewState.points,
    };
  }
  const transformedMask = previewRoi
    ? transformLocalAdjustmentMaskForPreviewRoi(mask, previewRoi)
    : mask;

  if (transformedMask.mode === "brush") {
    drawBrushMaskOverlay(context, transformedMask, canvas.width, canvas.height);
    return;
  }
  if (transformedMask.mode === "radial") {
    drawRadialMaskOverlay(context, transformedMask, canvas.width, canvas.height);
    return;
  }
  if (transformedMask.mode === "linear") {
    drawLinearMaskOverlay(context, transformedMask, canvas.width, canvas.height);
  }
};
