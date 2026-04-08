import type { RenderSurfaceHandle } from "@/lib/renderSurfaceHandle";
import {
  materializeSurfaceToCanvas,
  runRendererCanvasOperation,
  runRendererSurfaceOperation,
} from "@/lib/renderer/gpuSurfaceOperation";
import type { RenderMode } from "@/lib/renderer/RenderManager";
import type { EditorLayerBlendMode } from "@/types";
import type { AsciiGpuCarrierInput, AsciiTextmodeSurface } from "./types";

const resolveAsciiForegroundBlendMode = (
  blendMode: GlobalCompositeOperation
): EditorLayerBlendMode | null => {
  switch (blendMode) {
    case "source-over":
      return "normal";
    case "multiply":
      return "multiply";
    case "screen":
      return "screen";
    case "overlay":
      return "overlay";
    case "soft-light":
      return "softLight";
    default:
      return null;
  }
};

export const applyAsciiTextmodeOnGpu = async ({
  targetCanvas,
  surface,
  mode = "preview",
  slotId = "ascii-textmode",
}: {
  targetCanvas: HTMLCanvasElement;
  surface: AsciiTextmodeSurface;
  mode?: RenderMode;
  slotId?: string;
}) => {
  if (
    targetCanvas.width <= 0 ||
    targetCanvas.height <= 0 ||
    targetCanvas.width !== surface.width ||
    targetCanvas.height !== surface.height
  ) {
    return false;
  }

  const foregroundBlendMode = resolveAsciiForegroundBlendMode(surface.foregroundBlendMode);
  if (!foregroundBlendMode) {
    return false;
  }

  const renderedSurface = await applyAsciiTextmodeOnGpuToSurface({
    baseCanvas: targetCanvas,
    surface,
    mode,
    slotId,
    foregroundBlendMode,
  });
  if (!renderedSurface) {
    return false;
  }
  return materializeSurfaceToCanvas(renderedSurface, targetCanvas);
};

export const applyAsciiCarrierOnGpu = async ({
  targetCanvas,
  carrier,
  mode = "preview",
  slotId = "ascii-carrier",
}: {
  targetCanvas: HTMLCanvasElement;
  carrier: AsciiGpuCarrierInput;
  mode?: RenderMode;
  slotId?: string;
}) => {
  if (
    targetCanvas.width <= 0 ||
    targetCanvas.height <= 0 ||
    targetCanvas.width !== carrier.width ||
    targetCanvas.height !== carrier.height
  ) {
    return false;
  }

  const foregroundBlendMode = resolveAsciiForegroundBlendMode(carrier.foregroundBlendMode);
  if (!foregroundBlendMode) {
    return false;
  }

  return runRendererCanvasOperation({
    targetCanvas,
    mode,
    width: carrier.width,
    height: carrier.height,
    slotId,
    render: (renderer) =>
      renderer.renderAsciiCarrierComposite({
        baseCanvas: targetCanvas,
        carrier,
        foregroundBlendMode,
      }),
  });
};

export const applyAsciiTextmodeOnGpuToSurface = async ({
  baseCanvas,
  surface,
  mode,
  slotId = "ascii-textmode",
  foregroundBlendMode,
}: {
  baseCanvas: HTMLCanvasElement;
  surface: AsciiTextmodeSurface;
  mode: RenderMode;
  slotId?: string;
  foregroundBlendMode?: EditorLayerBlendMode | null;
}): Promise<RenderSurfaceHandle | null> => {
  if (
    baseCanvas.width <= 0 ||
    baseCanvas.height <= 0 ||
    baseCanvas.width !== surface.width ||
    baseCanvas.height !== surface.height
  ) {
    return null;
  }

  const resolvedForegroundBlendMode =
    foregroundBlendMode ?? resolveAsciiForegroundBlendMode(surface.foregroundBlendMode);
  if (!resolvedForegroundBlendMode) {
    return null;
  }

  return runRendererSurfaceOperation({
    mode,
    width: surface.width,
    height: surface.height,
    slotId,
    render: (renderer) =>
      renderer.renderAsciiTextmodeComposite({
        baseCanvas,
        surface,
        foregroundBlendMode: resolvedForegroundBlendMode,
      }),
  });
};

export const applyAsciiCarrierOnGpuToSurface = async ({
  baseCanvas,
  carrier,
  mode,
  slotId = "ascii-carrier",
  foregroundBlendMode,
}: {
  baseCanvas: HTMLCanvasElement;
  carrier: AsciiGpuCarrierInput;
  mode: RenderMode;
  slotId?: string;
  foregroundBlendMode?: EditorLayerBlendMode | null;
}): Promise<RenderSurfaceHandle | null> => {
  if (
    baseCanvas.width <= 0 ||
    baseCanvas.height <= 0 ||
    baseCanvas.width !== carrier.width ||
    baseCanvas.height !== carrier.height
  ) {
    return null;
  }

  const resolvedForegroundBlendMode =
    foregroundBlendMode ?? resolveAsciiForegroundBlendMode(carrier.foregroundBlendMode);
  if (!resolvedForegroundBlendMode) {
    return null;
  }

  return runRendererSurfaceOperation({
    mode,
    width: carrier.width,
    height: carrier.height,
    slotId,
    render: (renderer) =>
      renderer.renderAsciiCarrierComposite({
        baseCanvas,
        carrier,
        foregroundBlendMode: resolvedForegroundBlendMode,
      }),
  });
};

export { resolveAsciiForegroundBlendMode };
