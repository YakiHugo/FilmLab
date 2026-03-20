import type { CanvasOverlayRect } from "./overlayGeometry";

export interface CanvasSelectionPoint {
  x: number;
  y: number;
}

export interface CanvasSelectionTarget {
  id: string;
  rect: CanvasOverlayRect;
}

export const isSelectableSelectionTarget = (
  target: { effectiveLocked: boolean; effectiveVisible: boolean }
) => !target.effectiveLocked && target.effectiveVisible;

export const normalizeSelectionRect = (
  start: CanvasSelectionPoint,
  end: CanvasSelectionPoint
): CanvasOverlayRect => ({
  x: Math.min(start.x, end.x),
  y: Math.min(start.y, end.y),
  width: Math.abs(end.x - start.x),
  height: Math.abs(end.y - start.y),
});

export const rectsIntersect = (left: CanvasOverlayRect, right: CanvasOverlayRect) =>
  left.x <= right.x + right.width &&
  left.x + left.width >= right.x &&
  left.y <= right.y + right.height &&
  left.y + left.height >= right.y;

export const resolveIntersectingSelectionIds = (
  selectionRect: CanvasOverlayRect,
  targets: CanvasSelectionTarget[]
) => {
  const intersectingIds: string[] = [];

  for (const target of targets) {
    if (rectsIntersect(selectionRect, target.rect)) {
      intersectingIds.push(target.id);
    }
  }

  return intersectingIds;
};

export const mergeSelectionIds = (
  baseSelectedIds: string[],
  intersectingIds: string[],
  additive: boolean
) => (additive ? Array.from(new Set([...baseSelectedIds, ...intersectingIds])) : intersectingIds);

export const resolveMarqueeSelectionIds = (
  selectionRect: CanvasOverlayRect,
  targets: CanvasSelectionTarget[],
  baseSelectedIds: string[],
  additive: boolean
) =>
  mergeSelectionIds(
    baseSelectedIds,
    resolveIntersectingSelectionIds(selectionRect, targets),
    additive
  );

export const resolveCompletedMarqueeSelectionIds = ({
  additive,
  baseSelectedIds,
  hasActivated,
  nextSelectedIds,
}: {
  additive: boolean;
  baseSelectedIds: string[];
  hasActivated: boolean;
  nextSelectedIds: string[];
}) => {
  if (hasActivated) {
    return nextSelectedIds;
  }

  return additive ? baseSelectedIds : [];
};

export const selectionDistanceExceedsThreshold = (
  start: CanvasSelectionPoint,
  end: CanvasSelectionPoint,
  thresholdPx: number
) => Math.hypot(end.x - start.x, end.y - start.y) >= thresholdPx;

export const screenRectToWorldRect = (
  rect: CanvasOverlayRect,
  viewport: { x: number; y: number },
  zoom: number
): CanvasOverlayRect => ({
  x: (rect.x - viewport.x) / zoom,
  y: (rect.y - viewport.y) / zoom,
  width: rect.width / zoom,
  height: rect.height / zoom,
});
