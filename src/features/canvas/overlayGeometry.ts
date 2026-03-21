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

export interface CanvasToolbarMenuPlacement {
  align: "left" | "right";
  side: "top" | "bottom";
  maxHeight: number;
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

export const resolveToolbarMenuPlacement = ({
  containerHeight,
  containerWidth,
  gap = 10,
  menuHeight,
  menuWidth,
  padding = 8,
  toolbarRect,
}: {
  containerHeight: number;
  containerWidth: number;
  gap?: number;
  menuHeight: number;
  menuWidth: number;
  padding?: number;
  toolbarRect: CanvasOverlayRect;
}): CanvasToolbarMenuPlacement => {
  const availableRight = containerWidth - toolbarRect.x;
  const availableLeft = toolbarRect.x + toolbarRect.width;
  const align: "left" | "right" =
    availableRight >= menuWidth + padding
      ? "left"
      : availableLeft >= menuWidth + padding
        ? "right"
        : availableRight >= availableLeft
          ? "left"
          : "right";

  const availableBelow = containerHeight - (toolbarRect.y + toolbarRect.height + gap + padding);
  const availableAbove = toolbarRect.y - gap - padding;
  const canOpenBelow = availableBelow >= menuHeight;
  const canOpenAbove = availableAbove >= menuHeight;
  const side: "top" | "bottom" =
    canOpenBelow && !canOpenAbove
      ? "bottom"
      : canOpenAbove && !canOpenBelow
        ? "top"
        : availableBelow >= availableAbove
          ? "bottom"
          : "top";

  const maxHeight = Math.max(0, side === "bottom" ? availableBelow : availableAbove);

  return {
    align,
    side,
    maxHeight,
  };
};
