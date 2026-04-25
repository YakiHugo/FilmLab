import {
  type AnalysisRequirement,
  deriveAnalysisRequirements,
  requiresDevelopSnapshot,
} from "./analysisLayer";
import type { CarrierTransformNode, ImageEffectNode, SignalDamageNode } from "./types";

export interface ImageRenderSnapshotPlan {
  carrierTransforms: CarrierTransformNode[];
  signalDamage: SignalDamageNode[];
  developEffects: ImageEffectNode[];
  styleEffects: ImageEffectNode[];
  finalizeEffects: ImageEffectNode[];
  analysisRequirements: AnalysisRequirement[];
  requiresDevelopAnalysisSnapshot: boolean;
}

export const createImageRenderSnapshotPlan = (
  options: {
    carrierTransforms: readonly CarrierTransformNode[];
    signalDamage: readonly SignalDamageNode[];
    effects: readonly ImageEffectNode[];
  }
): ImageRenderSnapshotPlan => {
  const enabledCarrierTransforms = options.carrierTransforms.filter((transform) => transform.enabled);
  const enabledSignalDamage = options.signalDamage.filter((node) => node.enabled);
  const enabledEffects = options.effects.filter((effect) => effect.enabled);
  const analysisRequirements = deriveAnalysisRequirements(enabledCarrierTransforms);
  return {
    carrierTransforms: enabledCarrierTransforms,
    signalDamage: enabledSignalDamage,
    developEffects: enabledEffects.filter((effect) => effect.placement === "develop"),
    styleEffects: enabledEffects.filter((effect) => effect.placement === "style"),
    finalizeEffects: enabledEffects.filter((effect) => effect.placement === "finalize"),
    analysisRequirements,
    requiresDevelopAnalysisSnapshot: requiresDevelopSnapshot(analysisRequirements),
  };
};

export const assertSupportedImageRenderSnapshotPlan = (_plan: ImageRenderSnapshotPlan) => {};
