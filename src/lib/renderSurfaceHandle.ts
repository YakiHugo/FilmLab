import type { RenderMode } from "@/lib/renderer/RenderManager";

export interface RenderBoundaryMetrics {
  textureUploads: number;
  canvasMaterializations: number;
  canvasClones: number;
  cpuPixelReads: number;
}

export type RenderSurfaceKind =
  | "renderer-slot"
  | "output-canvas"
  | "owned-canvas"
  | "geometry-fallback";

export interface RenderSurfaceHandle {
  kind: RenderSurfaceKind;
  mode: RenderMode;
  slotId: string;
  width: number;
  height: number;
  sourceCanvas: HTMLCanvasElement;
  materializeToCanvas: (targetCanvas?: HTMLCanvasElement | null) => HTMLCanvasElement;
  cloneToCanvas: (targetCanvas?: HTMLCanvasElement | null) => HTMLCanvasElement;
}

export const createEmptyRenderBoundaryMetrics = (): RenderBoundaryMetrics => ({
  textureUploads: 0,
  canvasMaterializations: 0,
  canvasClones: 0,
  cpuPixelReads: 0,
});

export const cloneRenderBoundaryMetrics = (
  metrics: RenderBoundaryMetrics
): RenderBoundaryMetrics => ({
  textureUploads: metrics.textureUploads,
  canvasMaterializations: metrics.canvasMaterializations,
  canvasClones: metrics.canvasClones,
  cpuPixelReads: metrics.cpuPixelReads,
});

const ensureCanvasSize = (canvas: HTMLCanvasElement, width: number, height: number) => {
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  if (canvas.width !== safeWidth) {
    canvas.width = safeWidth;
  }
  if (canvas.height !== safeHeight) {
    canvas.height = safeHeight;
  }
};

const drawSurfaceToCanvas = (
  sourceCanvas: HTMLCanvasElement,
  targetCanvas?: HTMLCanvasElement | null
) => {
  const outputCanvas = targetCanvas ?? document.createElement("canvas");
  ensureCanvasSize(outputCanvas, sourceCanvas.width, sourceCanvas.height);
  const context = outputCanvas.getContext("2d", {
    willReadFrequently: true,
  });
  if (!context) {
    throw new Error("Failed to acquire surface materialization context.");
  }
  context.clearRect(0, 0, outputCanvas.width, outputCanvas.height);
  context.drawImage(sourceCanvas, 0, 0, outputCanvas.width, outputCanvas.height);
  return outputCanvas;
};

export const createRenderSurfaceHandle = (params: {
  kind: RenderSurfaceKind;
  mode: RenderMode;
  slotId: string;
  sourceCanvas: HTMLCanvasElement;
  metrics: RenderBoundaryMetrics;
}): RenderSurfaceHandle => ({
  kind: params.kind,
  mode: params.mode,
  slotId: params.slotId,
  width: params.sourceCanvas.width,
  height: params.sourceCanvas.height,
  sourceCanvas: params.sourceCanvas,
  materializeToCanvas: (targetCanvas) => {
    if (targetCanvas && targetCanvas === params.sourceCanvas) {
      return targetCanvas;
    }
    params.metrics.canvasMaterializations += 1;
    return drawSurfaceToCanvas(params.sourceCanvas, targetCanvas);
  },
  cloneToCanvas: (targetCanvas) => {
    params.metrics.canvasClones += 1;
    return drawSurfaceToCanvas(params.sourceCanvas, targetCanvas);
  },
});
