import type { RenderSurfaceHandle } from "@/lib/renderSurfaceHandle";
import {
  buildImageRenderMaskRevisionKey,
  renderImageEffectMaskToCanvas,
} from "./effectMask";
import { blendMaskedCanvasesOnGpuToSurface } from "@/lib/renderer/gpuMaskedCanvasBlend";
import type { ImageRenderMaskDefinition } from "./types";

export const applyMaskedStageOperationToSurfaceIfSupported = async ({
  surface,
  maskDefinition,
  maskReferenceCanvas,
  applyOperation,
  blendSlotId,
}: {
  surface: RenderSurfaceHandle;
  maskDefinition: ImageRenderMaskDefinition | null;
  maskReferenceCanvas?: HTMLCanvasElement;
  applyOperation: (options: {
    surface: RenderSurfaceHandle;
    maskRevisionKey: string | null;
  }) => RenderSurfaceHandle | null | Promise<RenderSurfaceHandle | null>;
  blendSlotId?: string;
}): Promise<RenderSurfaceHandle | null> => {
  if (!maskDefinition) {
    return applyOperation({
      surface,
      maskRevisionKey: null,
    });
  }

  const maskCanvas = document.createElement("canvas");
  const scratchCanvas = document.createElement("canvas");

  try {
    const effectSurface = await applyOperation({
      surface,
      maskRevisionKey: buildImageRenderMaskRevisionKey(maskDefinition),
    });
    if (!effectSurface) {
      return null;
    }

    const renderedMaskCanvas = await renderImageEffectMaskToCanvas({
      width: effectSurface.width,
      height: effectSurface.height,
      maskDefinition,
      referenceSource: maskReferenceCanvas,
      targetCanvas: maskCanvas,
      scratchCanvas,
    });
    if (!renderedMaskCanvas) {
      return null;
    }

    return blendMaskedCanvasesOnGpuToSurface({
      baseCanvas: surface.sourceCanvas,
      layerCanvas: effectSurface.sourceCanvas,
      maskCanvas: renderedMaskCanvas,
      slotId: blendSlotId ?? `stage-mask:${maskDefinition.id}`,
    });
  } finally {
    maskCanvas.width = 0;
    maskCanvas.height = 0;
    scratchCanvas.width = 0;
    scratchCanvas.height = 0;
  }
};
