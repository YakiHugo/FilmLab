import type { ImageAsciiEffectNode, ImageEffectNode } from "./types";

export interface ImageRenderSnapshotPlan {
  afterDevelopEffects: ImageEffectNode[];
  afterFilmEffects: ImageEffectNode[];
  afterOutputEffects: ImageEffectNode[];
  requiresDevelopAnalysisSnapshot: boolean;
  requiresFilmAnalysisSnapshot: boolean;
  invalidAfterDevelopAnalysisEffectIds: string[];
}

const effectUsesAsciiAnalysis = (effect: ImageEffectNode): effect is ImageAsciiEffectNode =>
  effect.type === "ascii";

export const createImageRenderSnapshotPlan = (
  effects: readonly ImageEffectNode[]
): ImageRenderSnapshotPlan => {
  const enabledEffects = effects.filter((effect) => effect.enabled);
  return {
    afterDevelopEffects: enabledEffects.filter((effect) => effect.placement === "afterDevelop"),
    afterFilmEffects: enabledEffects.filter((effect) => effect.placement === "afterFilm"),
    afterOutputEffects: enabledEffects.filter((effect) => effect.placement === "afterOutput"),
    requiresDevelopAnalysisSnapshot: enabledEffects.some(
      (effect) => effectUsesAsciiAnalysis(effect) && effect.analysisSource === "afterDevelop"
    ),
    requiresFilmAnalysisSnapshot: enabledEffects.some(
      (effect) => effectUsesAsciiAnalysis(effect) && effect.analysisSource === "afterFilm"
    ),
    invalidAfterDevelopAnalysisEffectIds: enabledEffects
      .filter(
        (effect) =>
          effectUsesAsciiAnalysis(effect) &&
          effect.placement === "afterDevelop" &&
          effect.analysisSource === "afterFilm"
      )
      .map((effect) => effect.id),
  };
};

export const assertSupportedImageRenderSnapshotPlan = (plan: ImageRenderSnapshotPlan) => {
  if (plan.invalidAfterDevelopAnalysisEffectIds.length === 0) {
    return;
  }

  throw new Error(
    `afterDevelop effects cannot analyze afterFilm snapshots before film has run: ${plan.invalidAfterDevelopAnalysisEffectIds.join(
      ", "
    )}`
  );
};
