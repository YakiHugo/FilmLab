import type { ImageAsciiEffectNode, ImageEffectNode } from "./types";

export interface ImageRenderSnapshotPlan {
  developEffects: ImageEffectNode[];
  styleEffects: ImageEffectNode[];
  finalizeEffects: ImageEffectNode[];
  requiresDevelopAnalysisSnapshot: boolean;
  requiresStyleAnalysisSnapshot: boolean;
  invalidDevelopAnalysisEffectIds: string[];
}

const effectUsesAsciiAnalysis = (effect: ImageEffectNode): effect is ImageAsciiEffectNode =>
  effect.type === "ascii";

export const createImageRenderSnapshotPlan = (
  effects: readonly ImageEffectNode[]
): ImageRenderSnapshotPlan => {
  const enabledEffects = effects.filter((effect) => effect.enabled);
  return {
    developEffects: enabledEffects.filter((effect) => effect.placement === "develop"),
    styleEffects: enabledEffects.filter((effect) => effect.placement === "style"),
    finalizeEffects: enabledEffects.filter((effect) => effect.placement === "finalize"),
    requiresDevelopAnalysisSnapshot: enabledEffects.some(
      (effect) => effectUsesAsciiAnalysis(effect) && effect.analysisSource === "develop"
    ),
    requiresStyleAnalysisSnapshot: enabledEffects.some(
      (effect) => effectUsesAsciiAnalysis(effect) && effect.analysisSource === "style"
    ),
    invalidDevelopAnalysisEffectIds: enabledEffects
      .filter(
        (effect) =>
          effectUsesAsciiAnalysis(effect) &&
          effect.placement === "develop" &&
          effect.analysisSource === "style"
      )
      .map((effect) => effect.id),
  };
};

export const assertSupportedImageRenderSnapshotPlan = (plan: ImageRenderSnapshotPlan) => {
  if (plan.invalidDevelopAnalysisEffectIds.length === 0) {
    return;
  }

  throw new Error(
    `develop-stage effects cannot analyze style snapshots before film has run: ${plan.invalidDevelopAnalysisEffectIds.join(
      ", "
    )}`
  );
};
