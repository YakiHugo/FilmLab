import { clamp } from "@/lib/math";
import type { PreviewFrameSize, ViewportRoi } from "./contracts";

interface CalculatePreviewViewportRoiInput {
  frameSize: PreviewFrameSize;
  viewScale: number;
  viewOffset: { x: number; y: number };
}

const MIN_SCALE_FOR_ROI = 1.01;
const MAX_VISIBLE_COVERAGE_FOR_ROI = 0.95;

export const calculatePreviewViewportRoi = ({
  frameSize,
  viewScale,
  viewOffset,
}: CalculatePreviewViewportRoiInput): ViewportRoi | null => {
  const frameWidth = Math.max(0, frameSize.width);
  const frameHeight = Math.max(0, frameSize.height);
  if (frameWidth <= 0 || frameHeight <= 0 || viewScale <= MIN_SCALE_FOR_ROI) {
    return null;
  }

  const centerX = frameWidth / 2;
  const centerY = frameHeight / 2;
  const visibleLeft = centerX - (centerX + viewOffset.x) / viewScale;
  const visibleTop = centerY - (centerY + viewOffset.y) / viewScale;
  const visibleWidth = frameWidth / viewScale;
  const visibleHeight = frameHeight / viewScale;
  const visibleRight = visibleLeft + visibleWidth;
  const visibleBottom = visibleTop + visibleHeight;

  const clampedLeft = clamp(visibleLeft / frameWidth, 0, 1);
  const clampedTop = clamp(visibleTop / frameHeight, 0, 1);
  const clampedRight = clamp(visibleRight / frameWidth, 0, 1);
  const clampedBottom = clamp(visibleBottom / frameHeight, 0, 1);
  const roiWidth = clamp(clampedRight - clampedLeft, 0, 1);
  const roiHeight = clamp(clampedBottom - clampedTop, 0, 1);

  if (roiWidth <= 0 || roiHeight <= 0) {
    return null;
  }

  if (roiWidth >= MAX_VISIBLE_COVERAGE_FOR_ROI && roiHeight >= MAX_VISIBLE_COVERAGE_FOR_ROI) {
    return null;
  }

  return {
    x: clampedLeft,
    y: clampedTop,
    width: roiWidth,
    height: roiHeight,
  };
};
