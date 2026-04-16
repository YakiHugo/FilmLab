import type { RenderSurfaceHandle } from "@/lib/renderSurfaceHandle";
import type { EditorLayerBlendMode } from "@/types";
import { runRendererCanvasOperation, runRendererSurfaceOperation } from "./gpuSurfaceOperation";

export interface AsciiCarrierGpuInput {
  width: number;
  height: number;
  cellWidth: number;
  cellHeight: number;
  columns: number;
  rows: number;
  renderMode: "glyph" | "dot";
  colorMode: "grayscale" | "full-color" | "duotone";
  foregroundOpacity: number;
  foregroundBlendMode: EditorLayerBlendMode;
  backgroundMode: "none" | "solid" | "cell-solid" | "blurred-source";
  backgroundOpacity: number;
  backgroundFillRgba: Uint8ClampedArray | null;
  cellBackgroundRgba: Uint8ClampedArray | null;
  backgroundSourceCanvas: HTMLCanvasElement | null;
  backgroundBlurPx: number;
  invert: boolean;
  gridOverlay: boolean;
  gridOverlayAlpha: number;
  duotoneShadowRgba: Uint8ClampedArray | null;
  charset: readonly string[];
  cellColorRgba: Uint8ClampedArray;
  cellToneR: Uint8ClampedArray;
}

const dimensionsMatch = (
  width: number,
  height: number,
  input: AsciiCarrierGpuInput
): boolean =>
  width > 0 && height > 0 && width === input.width && height === input.height;

export const applyAsciiCarrierOnGpuToSurface = async ({
  surface,
  input,
  slotId = "ascii-carrier",
}: {
  surface: RenderSurfaceHandle;
  input: AsciiCarrierGpuInput;
  slotId?: string;
}): Promise<RenderSurfaceHandle | null> => {
  if (!dimensionsMatch(surface.width, surface.height, input)) {
    return null;
  }
  return runRendererSurfaceOperation({
    mode: surface.mode,
    width: surface.width,
    height: surface.height,
    slotId,
    render: (renderer) =>
      renderer.renderAsciiCarrierComposite({
        baseCanvas: surface.sourceCanvas,
        carrier: input,
        foregroundBlendMode: input.foregroundBlendMode,
      }),
  });
};

export const applyAsciiCarrierOnGpu = async ({
  targetCanvas,
  input,
  slotId = "ascii-carrier",
}: {
  targetCanvas: HTMLCanvasElement;
  input: AsciiCarrierGpuInput;
  slotId?: string;
}): Promise<boolean> => {
  if (!dimensionsMatch(targetCanvas.width, targetCanvas.height, input)) {
    return false;
  }
  return runRendererCanvasOperation({
    targetCanvas,
    width: targetCanvas.width,
    height: targetCanvas.height,
    slotId,
    render: (renderer) =>
      renderer.renderAsciiCarrierComposite({
        baseCanvas: targetCanvas,
        carrier: input,
        foregroundBlendMode: input.foregroundBlendMode,
      }),
  });
};
