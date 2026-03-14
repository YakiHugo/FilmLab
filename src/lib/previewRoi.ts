import { clamp } from "@/lib/math";
import type { LocalAdjustmentMask } from "@/types";

export interface PreviewRoi {
  centerX: number;
  centerY: number;
  zoom: number;
  width: number;
  height: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface PreviewViewportRoiInput {
  frameWidth: number;
  frameHeight: number;
  viewScale: number;
  viewOffset: { x: number; y: number };
}

const MIN_PREVIEW_EXTENT = 1e-4;

const transformCoordinate = (value: number, start: number, size: number) =>
  (value - start) / Math.max(MIN_PREVIEW_EXTENT, size);

const resolvePreviewExtentScale = (roi: PreviewRoi) =>
  1 / Math.max(MIN_PREVIEW_EXTENT, Math.min(roi.width, roi.height));

export const resolvePreviewRoiFromViewport = ({
  frameWidth,
  frameHeight,
  viewScale,
  viewOffset,
}: PreviewViewportRoiInput): PreviewRoi | null => {
  if (viewScale <= 1.001 || frameWidth <= 0 || frameHeight <= 0) {
    return null;
  }
  const width = 1 / viewScale;
  const height = 1 / viewScale;
  const centerX = clamp(0.5 - viewOffset.x / (frameWidth * viewScale), width / 2, 1 - width / 2);
  const centerY = clamp(0.5 - viewOffset.y / (frameHeight * viewScale), height / 2, 1 - height / 2);
  return {
    centerX,
    centerY,
    zoom: viewScale,
    width,
    height,
    left: centerX - width / 2,
    top: centerY - height / 2,
    right: centerX + width / 2,
    bottom: centerY + height / 2,
  };
};

export const mapPreviewPointToImageCoordinates = <T extends { x: number; y: number }>(
  point: T,
  roi: PreviewRoi | null
): T => {
  if (!roi) {
    return point;
  }
  return {
    ...point,
    x: roi.left + point.x * roi.width,
    y: roi.top + point.y * roi.height,
  };
};

export const transformLocalAdjustmentMaskForPreviewRoi = (
  mask: LocalAdjustmentMask,
  roi: PreviewRoi
): LocalAdjustmentMask => {
  if (mask.mode === "brush") {
    const extentScale = resolvePreviewExtentScale(roi);
    return {
      ...mask,
      pointsBlobId: undefined,
      points: mask.points.map((point) => ({
        ...point,
        x: transformCoordinate(point.x, roi.left, roi.width),
        y: transformCoordinate(point.y, roi.top, roi.height),
      })),
      brushSize: mask.brushSize * extentScale,
    };
  }
  if (mask.mode === "radial") {
    return {
      ...mask,
      centerX: transformCoordinate(mask.centerX, roi.left, roi.width),
      centerY: transformCoordinate(mask.centerY, roi.top, roi.height),
      radiusX: mask.radiusX / Math.max(MIN_PREVIEW_EXTENT, roi.width),
      radiusY: mask.radiusY / Math.max(MIN_PREVIEW_EXTENT, roi.height),
    };
  }
  return {
    ...mask,
    startX: transformCoordinate(mask.startX, roi.left, roi.width),
    startY: transformCoordinate(mask.startY, roi.top, roi.height),
    endX: transformCoordinate(mask.endX, roi.left, roi.width),
    endY: transformCoordinate(mask.endY, roi.top, roi.height),
  };
};
