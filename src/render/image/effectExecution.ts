import { applyFilter2dPostProcessing } from "@/lib/filter2dPostProcessing";
import type { RenderSurfaceHandle } from "@/lib/renderSurfaceHandle";
import {
  applyFilter2dOnGpu,
  applyFilter2dOnGpuToSurface,
} from "@/lib/renderer/gpuFilter2dPostProcessing";
import { blendMaskedCanvasesOnGpuToSurface } from "@/lib/renderer/gpuMaskedCanvasBlend";
import { applyMaskedStageOperation } from "./stageMaskComposite";
import { renderImageEffectMaskToCanvas } from "./effectMask";
import type {
  ImageEffectNode,
  ImageFilter2dEffectNode,
  ImageRenderDocument,
} from "./types";

const applyFilter2dEffect = async ({
  canvas,
  effect,
}: {
  canvas: HTMLCanvasElement;
  effect: ImageFilter2dEffectNode;
}) => {
  const appliedOnGpu = await applyFilter2dOnGpu({
    canvas,
    params: effect.params,
    slotId: `filter2d:${effect.id}`,
  });
  if (!appliedOnGpu) {
    applyFilter2dPostProcessing(canvas, effect.params);
  }
};

export const applyImageEffectsToSurfaceIfSupported = async ({
  surface,
  document: renderDocument,
  effects,
  stageReferenceCanvas,
}: {
  surface: RenderSurfaceHandle;
  document?: ImageRenderDocument;
  effects: readonly ImageEffectNode[];
  stageReferenceCanvas?: HTMLCanvasElement;
}) => {
  let currentSurface = surface;
  for (const effect of effects) {
    if (effect.type !== "filter2d") {
      return null;
    }
    if (!effect.maskId) {
      const nextSurface = await applyFilter2dOnGpuToSurface({
        surface: currentSurface,
        params: effect.params,
        slotId: `filter2d:${effect.id}`,
      });
      if (!nextSurface) {
        return null;
      }
      currentSurface = nextSurface;
      continue;
    }

    if (!renderDocument || !stageReferenceCanvas) {
      return null;
    }
    const maskDefinition = renderDocument.masks.byId[effect.maskId] ?? null;
    if (!maskDefinition) {
      return null;
    }

    const effectSurface = await applyFilter2dOnGpuToSurface({
      surface: currentSurface,
      params: effect.params,
      slotId: `filter2d:${effect.id}`,
    });
    if (!effectSurface) {
      return null;
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
        return null;
      }

      const blendedSurface = await blendMaskedCanvasesOnGpuToSurface({
        baseCanvas: currentSurface.sourceCanvas,
        layerCanvas: effectSurface.sourceCanvas,
        maskCanvas: renderedMaskCanvas,
        slotId: `effect-mask-blend:${effect.id}`,
      });
      if (!blendedSurface) {
        return null;
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

export const applyImageEffects = async ({
  canvas,
  document,
  effects,
  stageReferenceCanvas,
}: {
  canvas: HTMLCanvasElement;
  document: ImageRenderDocument;
  effects: readonly ImageEffectNode[];
  stageReferenceCanvas?: HTMLCanvasElement;
}) => {
  for (const effect of effects) {
    const maskDefinition = effect.maskId ? document.masks.byId[effect.maskId] ?? null : null;
    if (!maskDefinition) {
      await applyFilter2dEffect({
        canvas,
        effect,
      });
      continue;
    }
    await applyMaskedStageOperation({
      canvas,
      maskDefinition,
      maskReferenceCanvas: stageReferenceCanvas ?? canvas,
      applyOperation: async ({ canvas: targetCanvas }) => {
        await applyFilter2dEffect({
          canvas: targetCanvas,
          effect,
        });
      },
    });
  }
};
