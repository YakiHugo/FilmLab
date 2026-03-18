export const GRID_SIZE = 16;
export const GRID_OVERSCAN_SCREEN_PX = 256;

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

export function quantizeDragPosition(position: CanvasPoint, grid = GRID_SIZE): CanvasPoint {
  return snapPoint(position, grid);
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
  overscanScreenPx = GRID_OVERSCAN_SCREEN_PX,
  grid = GRID_SIZE
): VisibleWorldGridBounds {
  const safeZoom = zoom > 0 ? zoom : 1;
  const worldOverscan = overscanScreenPx / safeZoom;
  const rawMinX = (0 - viewport.x) / safeZoom - worldOverscan;
  const rawMinY = (0 - viewport.y) / safeZoom - worldOverscan;
  const rawMaxX = (stageSize.width - viewport.x) / safeZoom + worldOverscan;
  const rawMaxY = (stageSize.height - viewport.y) / safeZoom + worldOverscan;
  const startX = alignGridStart(rawMinX, grid);
  const endX = alignGridEnd(rawMaxX, grid);
  const startY = alignGridStart(rawMinY, grid);
  const endY = alignGridEnd(rawMaxY, grid);

  return {
    x: startX,
    y: startY,
    width: Math.max(0, endX - startX),
    height: Math.max(0, endY - startY),
    startX,
    endX,
    startY,
    endY,
  };
}
