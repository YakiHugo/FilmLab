import { clamp } from "@/lib/math";

export const clampRange = (value: number, min: number, max: number) => {
  if (max < min) {
    return max;
  }
  return clamp(value, min, max);
};

export const isEditableElement = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tagName = target.tagName.toLowerCase();
  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    target.isContentEditable
  );
};

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 3;
export const ZOOM_STEP = 0.05;
export const CROP_RECT_MIN_SIZE = 72;

export type CropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type Point = {
  x: number;
  y: number;
};

export type CropDragMode = "move" | "nw" | "ne" | "sw" | "se" | "n" | "e" | "s" | "w";

export const CROP_CORNER_HANDLES = ["nw", "ne", "sw", "se"] as const;
export const CROP_EDGE_HANDLES = ["n", "e", "s", "w"] as const;
export type CropCornerHandle = (typeof CROP_CORNER_HANDLES)[number];
export type CropEdgeHandle = (typeof CROP_EDGE_HANDLES)[number];

export const isCropCornerHandle = (mode: CropDragMode): mode is CropCornerHandle =>
  CROP_CORNER_HANDLES.includes(mode as CropCornerHandle);

export const isCropEdgeHandle = (mode: CropDragMode): mode is CropEdgeHandle =>
  CROP_EDGE_HANDLES.includes(mode as CropEdgeHandle);

export const CROP_CORNER_EDGE_MAP: Record<
  CropCornerHandle,
  readonly [CropEdgeHandle, CropEdgeHandle]
> = {
  nw: ["n", "w"],
  ne: ["n", "e"],
  sw: ["s", "w"],
  se: ["s", "e"],
};

export const getCropHandlePoint = (rect: CropRect, mode: CropDragMode) => {
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  switch (mode) {
    case "nw":
      return { x: rect.x, y: rect.y };
    case "ne":
      return { x: right, y: rect.y };
    case "sw":
      return { x: rect.x, y: bottom };
    case "se":
      return { x: right, y: bottom };
    case "n":
      return { x: centerX, y: rect.y };
    case "e":
      return { x: right, y: centerY };
    case "s":
      return { x: centerX, y: bottom };
    case "w":
      return { x: rect.x, y: centerY };
    default:
      return { x: centerX, y: centerY };
  }
};

export const toCenteredRect = (
  centerX: number,
  centerY: number,
  halfWidth: number,
  halfHeight: number
): CropRect => ({
  x: centerX - halfWidth,
  y: centerY - halfHeight,
  width: halfWidth * 2,
  height: halfHeight * 2,
});

export const buildCropImagePolygon = (
  frameWidth: number,
  frameHeight: number,
  rotate: number,
  horizontal: number,
  vertical: number
): Point[] => {
  const normalizedHorizontal = clamp(horizontal / 5, -20, 20);
  const normalizedVertical = clamp(vertical / 5, -20, 20);
  const translateX = (normalizedHorizontal / 100) * frameWidth;
  const translateY = (normalizedVertical / 100) * frameHeight;
  const centerX = frameWidth / 2 + translateX;
  const centerY = frameHeight / 2 + translateY;
  const angle = (rotate * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const halfWidth = frameWidth / 2;
  const halfHeight = frameHeight / 2;
  const localCorners: Point[] = [
    { x: -halfWidth, y: -halfHeight },
    { x: halfWidth, y: -halfHeight },
    { x: halfWidth, y: halfHeight },
    { x: -halfWidth, y: halfHeight },
  ];
  return localCorners.map((corner) => ({
    x: centerX + corner.x * cos - corner.y * sin,
    y: centerY + corner.x * sin + corner.y * cos,
  }));
};

export const isPointInsideConvexPolygon = (point: Point, polygon: Point[]) => {
  let hasPositive = false;
  let hasNegative = false;
  for (let i = 0; i < polygon.length; i += 1) {
    const current = polygon[i];
    const next = polygon[(i + 1) % polygon.length];
    if (!current || !next) {
      continue;
    }
    const cross =
      (next.x - current.x) * (point.y - current.y) - (next.y - current.y) * (point.x - current.x);
    if (Math.abs(cross) <= 0.0001) {
      continue;
    }
    if (cross > 0) {
      hasPositive = true;
    } else {
      hasNegative = true;
    }
    if (hasPositive && hasNegative) {
      return false;
    }
  }
  return true;
};

export const isCropRectInsidePolygon = (rect: CropRect, polygon: Point[]) => {
  const corners: Point[] = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ];
  return corners.every((corner) => isPointInsideConvexPolygon(corner, polygon));
};

export const fitCenteredRectToPolygon = (
  centerX: number,
  centerY: number,
  startHalfWidth: number,
  startHalfHeight: number,
  targetHalfWidth: number,
  targetHalfHeight: number,
  polygon: Point[]
) => {
  const targetRect = toCenteredRect(centerX, centerY, targetHalfWidth, targetHalfHeight);
  if (isCropRectInsidePolygon(targetRect, polygon)) {
    return { halfWidth: targetHalfWidth, halfHeight: targetHalfHeight };
  }

  const startRect = toCenteredRect(centerX, centerY, startHalfWidth, startHalfHeight);
  const hasValidStart = isCropRectInsidePolygon(startRect, polygon);
  const anchorHalfWidth = hasValidStart ? startHalfWidth : 0;
  const anchorHalfHeight = hasValidStart ? startHalfHeight : 0;
  if (!hasValidStart) {
    const centerRect = toCenteredRect(centerX, centerY, 0, 0);
    if (!isCropRectInsidePolygon(centerRect, polygon)) {
      return { halfWidth: startHalfWidth, halfHeight: startHalfHeight };
    }
  }

  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 18; i += 1) {
    const mid = (lo + hi) / 2;
    const testHalfWidth = anchorHalfWidth + (targetHalfWidth - anchorHalfWidth) * mid;
    const testHalfHeight = anchorHalfHeight + (targetHalfHeight - anchorHalfHeight) * mid;
    const testRect = toCenteredRect(centerX, centerY, testHalfWidth, testHalfHeight);
    if (isCropRectInsidePolygon(testRect, polygon)) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const finalHalfWidth = anchorHalfWidth + (targetHalfWidth - anchorHalfWidth) * lo;
  const finalHalfHeight = anchorHalfHeight + (targetHalfHeight - anchorHalfHeight) * lo;

  // Shrink by 0.5px safety margin to avoid floating-point boundary touching
  const safeHalfWidth = Math.max(0, finalHalfWidth - 0.5);
  const safeHalfHeight = Math.max(0, finalHalfHeight - 0.5);
  const safeRect = toCenteredRect(centerX, centerY, safeHalfWidth, safeHalfHeight);
  if (isCropRectInsidePolygon(safeRect, polygon)) {
    return { halfWidth: safeHalfWidth, halfHeight: safeHalfHeight };
  }
  return { halfWidth: finalHalfWidth, halfHeight: finalHalfHeight };
};
