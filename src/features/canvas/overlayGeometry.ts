export interface CanvasOverlayRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CanvasOverlayPosition {
  left: number;
  top: number;
}

export const clampOverlayValue = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const resolveFloatingOverlayPosition = ({
  anchorRect,
  containerHeight,
  containerWidth,
  gap = 12,
  overlayHeight,
  overlayWidth,
}: {
  anchorRect: CanvasOverlayRect;
  containerHeight: number;
  containerWidth: number;
  gap?: number;
  overlayHeight: number;
  overlayWidth: number;
}): CanvasOverlayPosition => {
  const idealLeft = anchorRect.x + anchorRect.width / 2 - overlayWidth / 2;
  const idealTop = anchorRect.y - overlayHeight - gap;
  const maxLeft = Math.max(0, containerWidth - overlayWidth);
  const topFallback = anchorRect.y + anchorRect.height + gap;
  const maxTop = Math.max(0, containerHeight - overlayHeight);

  return {
    left: clampOverlayValue(idealLeft, 0, maxLeft),
    top:
      idealTop >= 0
        ? clampOverlayValue(idealTop, 0, maxTop)
        : clampOverlayValue(topFallback, 0, maxTop),
  };
};
