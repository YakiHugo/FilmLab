import type { RenderSurfaceHandle } from "@/lib/renderSurfaceHandle";
import { applyFilter2dOnGpuToSurface } from "@/lib/renderer/gpuFilter2dPostProcessing";
import { blendMaskedCanvasesOnGpuToSurface } from "@/lib/renderer/gpuMaskedCanvasBlend";
import { renderImageEffectMaskToCanvas } from "./effectMask";
import type { ImageEffectNode, ImageRenderDocument } from "./types";

export const applyImageEffects = async ({
  surface,
  document: renderDocument,
  effects,
  stageReferenceCanvas,
}: {
  surface: RenderSurfaceHandle;
  document?: ImageRenderDocument;
  effects: readonly ImageEffectNode[];
  stageReferenceCanvas?: HTMLCanvasElement;
}): Promise<RenderSurfaceHandle> => {
  let currentSurface = surface;
  for (const effect of effects) {
    if (effect.type !== "filter2d") {
      throw new Error(`Unsupported image effect type: ${(effect as { type: string }).type}`);
    }

    if (!effect.maskId) {
      const nextSurface = await applyFilter2dOnGpuToSurface({
        surface: currentSurface,
        params: effect.params,
        slotId: `filter2d:${effect.id}`,
      });
      if (!nextSurface) {
        throw new Error(`filter2d GPU pass failed for effect ${effect.id}`);
      }
      currentSurface = nextSurface;
      continue;
    }

    if (!renderDocument || !stageReferenceCanvas) {
      throw new Error(
        `Masked effect ${effect.id} requires document and stageReferenceCanvas.`
      );
    }
    const maskDefinition = renderDocument.masks.byId[effect.maskId] ?? null;
    if (!maskDefinition) {
      throw new Error(`Mask definition ${effect.maskId} missing for effect ${effect.id}`);
    }

    const effectSurface = await applyFilter2dOnGpuToSurface({
      surface: currentSurface,
      params: effect.params,
      slotId: `filter2d:${effect.id}`,
    });
    if (!effectSurface) {
      throw new Error(`filter2d GPU pass failed for effect ${effect.id}`);
    }

    const maskCanvas = document.createElement("canvas");
    const scratchCanvas = document.createElement("canvas");
    try {
      const renderedMaskCanvas = await renderImageEffectMaskToCanvas({
        width: currentSurface.width,
        height: currentSurface.height,
        maskDefinition,
        referenceSource: stageReferenceCanvas,
        targetCanvas: maskCanvas,
        scratchCanvas,
      });
      if (!renderedMaskCanvas) {
        throw new Error(`Mask rasterization failed for effect ${effect.id}`);
      }

      const blendedSurface = await blendMaskedCanvasesOnGpuToSurface({
        baseCanvas: currentSurface.sourceCanvas,
        layerCanvas: effectSurface.sourceCanvas,
        maskCanvas: renderedMaskCanvas,
        slotId: `effect-mask-blend:${effect.id}`,
      });
      if (!blendedSurface) {
        throw new Error(`Masked effect blend failed for effect ${effect.id}`);
      }
      currentSurface = blendedSurface;
    } finally {
      maskCanvas.width = 0;
      maskCanvas.height = 0;
      scratchCanvas.width = 0;
      scratchCanvas.height = 0;
    }
  }
  return currentSurface;
};
