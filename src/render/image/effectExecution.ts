import { applyFilter2dPostProcessing } from "@/lib/filter2dPostProcessing";
import { applyMaskedStageOperation } from "./stageMaskComposite";
import type {
  ImageEffectNode,
  ImageFilter2dEffectNode,
  ImageRenderDocument,
} from "./types";

const applyFilter2dEffect = ({
  canvas,
  effect,
}: {
  canvas: HTMLCanvasElement;
  effect: ImageFilter2dEffectNode;
}) => {
  applyFilter2dPostProcessing(canvas, effect.params);
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
  stageReferenceCanvas: HTMLCanvasElement;
}) => {
  for (const effect of effects) {
    const maskDefinition = effect.maskId ? document.masks.byId[effect.maskId] ?? null : null;
    await applyMaskedStageOperation({
      canvas,
      maskDefinition,
      maskReferenceCanvas: stageReferenceCanvas,
      applyOperation: ({ canvas: targetCanvas }) => {
        applyFilter2dEffect({
          canvas: targetCanvas,
          effect,
        });
      },
    });
  }
};
