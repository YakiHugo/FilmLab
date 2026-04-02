import { applyFilter2dPostProcessing } from "@/lib/filter2dPostProcessing";
import { applyFilter2dOnGpu } from "@/lib/renderer/gpuFilter2dPostProcessing";
import { applyMaskedStageOperation } from "./stageMaskComposite";
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
