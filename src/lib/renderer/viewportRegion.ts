import { clamp } from "@/lib/math";

export interface ViewportRoi {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ViewportRenderRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const resolveViewportRenderRegion = (
  outputWidth: number,
  outputHeight: number,
  viewportRoi?: ViewportRoi | null
): ViewportRenderRegion | null => {
  if (
    !viewportRoi ||
    !Number.isFinite(viewportRoi.width) ||
    !Number.isFinite(viewportRoi.height) ||
    viewportRoi.width <= 0 ||
    viewportRoi.height <= 0
  ) {
    return null;
  }

  const safeWidth = Math.max(1, Math.round(outputWidth));
  const safeHeight = Math.max(1, Math.round(outputHeight));
  const left = clamp(Math.round(viewportRoi.x * safeWidth), 0, safeWidth - 1);
  const top = clamp(Math.round(viewportRoi.y * safeHeight), 0, safeHeight - 1);
  const right = clamp(
    Math.round((viewportRoi.x + viewportRoi.width) * safeWidth),
    left + 1,
    safeWidth
  );
  const bottom = clamp(
    Math.round((viewportRoi.y + viewportRoi.height) * safeHeight),
    top + 1,
    safeHeight
  );

  if (right <= left || bottom <= top) {
    return null;
  }

  if (right - left >= safeWidth && bottom - top >= safeHeight) {
    return null;
  }

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
};
