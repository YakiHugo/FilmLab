import type { EditorLayerBlendMode, EditorLayerMask } from "@/types";
import type { CanvasCompositeRegion } from "./composition";

export interface CompositeLayerSurface {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

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
