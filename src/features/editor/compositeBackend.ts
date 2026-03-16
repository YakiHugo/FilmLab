import type { EditorLayerBlendMode, EditorLayerMask } from "@/types";
import type { CanvasCompositeRegion } from "./composition";

export interface CompositeLayerSurface {
  kind: string;
  drawSource: CanvasImageSource;
  width: number;
  height: number;
}

export interface CanvasBackedCompositeLayerSurface extends CompositeLayerSurface {
  kind: "canvas";
  drawSource: HTMLCanvasElement;
  renderTarget: HTMLCanvasElement;
}

export const createCanvasBackedCompositeLayerSurface = (
  canvas: HTMLCanvasElement
): CanvasBackedCompositeLayerSurface => ({
  kind: "canvas",
  drawSource: canvas,
  renderTarget: canvas,
  width: canvas.width,
  height: canvas.height,
});

export interface CompositeLayerRequest {
  layerId: string;
  surface: CompositeLayerSurface;
  opacity: number;
  blendMode: EditorLayerBlendMode;
  mask?: {
    value: EditorLayerMask;
    referenceSource?: CanvasImageSource;
  };
}

export interface CompositeBackendWorkspace {
  getLayerMaskCanvas: (layerId: string) => HTMLCanvasElement;
  getLayerMaskScratchCanvas: (layerId: string) => HTMLCanvasElement;
  getMaskedLayerCanvas: (layerId: string) => HTMLCanvasElement;
}

export interface CompositeBackendComposeOptions {
  targetCanvas: HTMLCanvasElement;
  targetSize: {
    width: number;
    height: number;
  };
  region?: CanvasCompositeRegion | null;
  layers: CompositeLayerRequest[];
  workspace: CompositeBackendWorkspace;
}

export interface CompositeBackend {
  id: string;
  compose: (options: CompositeBackendComposeOptions) => Promise<boolean> | boolean;
}
