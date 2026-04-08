import type { EditorLayerBlendMode, EditorLayerMask } from "@/types";
import type { CanvasCompositeRegion } from "./composition";

export interface CompositeLayerSurface {
  kind: string;
  drawSource: CanvasImageSource;
  width: number;
  height: number;
}

export const createCanvasCompositeLayerSurface = (
  canvas: HTMLCanvasElement
): CompositeLayerSurface => ({
  kind: "canvas",
  drawSource: canvas,
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

export type CompositeBackendWorkspace = object;

export interface CompositeBackendComposeOptions<
  Workspace extends CompositeBackendWorkspace = CompositeBackendWorkspace,
> {
  targetCanvas: HTMLCanvasElement;
  targetSize: {
    width: number;
    height: number;
  };
  region?: CanvasCompositeRegion | null;
  layers: CompositeLayerRequest[];
  workspace: Workspace;
}

export interface CompositeBackend<
  Workspace extends CompositeBackendWorkspace = CompositeBackendWorkspace,
> {
  id: string;
  compose: (options: CompositeBackendComposeOptions<Workspace>) => Promise<boolean> | boolean;
}
