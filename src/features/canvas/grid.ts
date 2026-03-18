export const GRID_SIZE = 16;

export interface CanvasPoint {
  x: number;
  y: number;
}

export interface CanvasSize {
  width: number;
  height: number;
}

export interface CanvasRect extends CanvasPoint, CanvasSize {}

export interface VisibleWorldGridBounds extends CanvasRect {
  startX: number;
  endX: number;
  startY: number;
  endY: number;
}

const alignGridStart = (value: number, grid: number) => Math.floor(value / grid) * grid;
const alignGridEnd = (value: number, grid: number) => Math.ceil(value / grid) * grid;

export function snap(value: number, grid = GRID_SIZE): number {
  return Math.round(value / grid) * grid;
}

export function snapPoint(point: CanvasPoint, grid = GRID_SIZE): CanvasPoint {
  return {
    x: snap(point.x, grid),
    y: snap(point.y, grid),
  };
}

export function snapSize(size: CanvasSize, grid = GRID_SIZE): CanvasSize {
  return {
    width: snap(size.width, grid),
    height: snap(size.height, grid),
  };
}

export function snapRect(rect: CanvasRect, grid = GRID_SIZE): CanvasRect {
  return {
    x: snap(rect.x, grid),
    y: snap(rect.y, grid),
    width: snap(rect.width, grid),
    height: snap(rect.height, grid),
  };
}

export function getVisibleWorldGridBounds(
  viewport: CanvasPoint,
  zoom: number,
  stageSize: CanvasSize,
  documentSize: CanvasSize,
  grid = GRID_SIZE
): VisibleWorldGridBounds {
  const safeZoom = zoom || 1;
  const rawMinX = (0 - viewport.x) / safeZoom;
  const rawMinY = (0 - viewport.y) / safeZoom;
  const rawMaxX = (stageSize.width - viewport.x) / safeZoom;
  const rawMaxY = (stageSize.height - viewport.y) / safeZoom;

  const minX = Math.max(0, rawMinX);
  const minY = Math.max(0, rawMinY);
  const maxX = Math.min(documentSize.width, rawMaxX);
  const maxY = Math.min(documentSize.height, rawMaxY);

  return {
    x: minX,
    y: minY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
    startX: Math.max(0, alignGridStart(minX, grid) - grid),
    endX: Math.min(documentSize.width, alignGridEnd(maxX, grid) + grid),
    startY: Math.max(0, alignGridStart(minY, grid) - grid),
    endY: Math.min(documentSize.height, alignGridEnd(maxY, grid) + grid),
  };
}
