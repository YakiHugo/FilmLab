import type { CarrierTransformNode, ImageEffectNode } from "./types";

export interface ImageRenderSnapshotPlan {
  carrierTransforms: CarrierTransformNode[];
  developEffects: ImageEffectNode[];
  styleEffects: ImageEffectNode[];
  finalizeEffects: ImageEffectNode[];
  requiresDevelopAnalysisSnapshot: boolean;
  requiresStyleAnalysisSnapshot: boolean;
}

export const createImageRenderSnapshotPlan = (
  options: {
    carrierTransforms: readonly CarrierTransformNode[];
    effects: readonly ImageEffectNode[];
  }
): ImageRenderSnapshotPlan => {
  const enabledCarrierTransforms = options.carrierTransforms.filter((transform) => transform.enabled);
  const enabledEffects = options.effects.filter((effect) => effect.enabled);
  return {
    carrierTransforms: enabledCarrierTransforms,
    developEffects: enabledEffects.filter((effect) => effect.placement === "develop"),
    styleEffects: enabledEffects.filter((effect) => effect.placement === "style"),
    finalizeEffects: enabledEffects.filter((effect) => effect.placement === "finalize"),
    requiresDevelopAnalysisSnapshot: enabledCarrierTransforms.some(
      (transform) => transform.analysisSource === "develop"
    ),
    requiresStyleAnalysisSnapshot: enabledCarrierTransforms.some(
      (transform) => transform.analysisSource === "style"
    ),
  };
};

export const assertSupportedImageRenderSnapshotPlan = (_plan: ImageRenderSnapshotPlan) => {};
