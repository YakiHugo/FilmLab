export interface CanvasViewportInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface CanvasViewportPoint {
  x: number;
  y: number;
}

export interface CanvasViewportSize {
  width: number;
  height: number;
}

export interface CanvasViewportTransform {
  viewport: CanvasViewportPoint;
  zoom: number;
}

export const CANVAS_MIN_ZOOM = 0.2;
export const CANVAS_MAX_ZOOM = 4;
export const CANVAS_FIT_MAX_ZOOM = 1;
export const CANVAS_ZOOM_STEP = 1.08;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const clampCanvasZoom = (
  value: number,
  min = CANVAS_MIN_ZOOM,
  max = CANVAS_MAX_ZOOM
) => clamp(value, min, max);

export const resolveCanvasFitView = ({
  insets,
  stageSize,
  workbenchSize,
}: {
  insets: CanvasViewportInsets;
  stageSize: CanvasViewportSize;
  workbenchSize: CanvasViewportSize;
}): CanvasViewportTransform | null => {
  if (
    stageSize.width <= 0 ||
    stageSize.height <= 0 ||
    workbenchSize.width <= 0 ||
    workbenchSize.height <= 0
  ) {
    return null;
  }

  const usableWidth = Math.max(1, stageSize.width - insets.left - insets.right);
  const usableHeight = Math.max(1, stageSize.height - insets.top - insets.bottom);
  const zoom = clampCanvasZoom(
    Math.min(usableWidth / workbenchSize.width, usableHeight / workbenchSize.height, 1),
    CANVAS_MIN_ZOOM,
    CANVAS_FIT_MAX_ZOOM
  );

  return {
    zoom,
    viewport: {
      x: Math.round(insets.left + (usableWidth - workbenchSize.width * zoom) / 2),
      y: Math.round(insets.top + (usableHeight - workbenchSize.height * zoom) / 2),
    },
  };
};

export const resolveCanvasPointFromScreen = ({
  screenPoint,
  viewport,
  zoom,
}: {
  screenPoint: CanvasViewportPoint;
  viewport: CanvasViewportPoint;
  zoom: number;
}): CanvasViewportPoint => ({
  x: (screenPoint.x - viewport.x) / zoom,
  y: (screenPoint.y - viewport.y) / zoom,
});

export const resolveCanvasZoomStep = ({
  direction,
  scaleBy = CANVAS_ZOOM_STEP,
  zoom,
}: {
  direction: "in" | "out";
  scaleBy?: number;
  zoom: number;
}) => clampCanvasZoom(direction === "in" ? zoom * scaleBy : zoom / scaleBy);

export const resolveViewportAfterZoom = ({
  nextZoom,
  pointer,
  viewport,
  zoom,
}: {
  nextZoom: number;
  pointer: CanvasViewportPoint;
  viewport: CanvasViewportPoint;
  zoom: number;
}): CanvasViewportPoint => {
  const worldPoint = resolveCanvasPointFromScreen({
    screenPoint: pointer,
    viewport,
    zoom,
  });

  return {
    x: pointer.x - worldPoint.x * nextZoom,
    y: pointer.y - worldPoint.y * nextZoom,
  };
};
