import { clamp } from "../math";
import type { AssetAiRecommendation, AiPresetRecommendation, Preset } from "@/types";

export const MAX_STYLE_SELECTION = 36;
export const MAX_RECOMMENDATION_RETRIES = 3;
export const DEFAULT_TOP_K = 5;

const toSafeReason = (value: string | undefined) => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "Matched by visual style.";
};

const toSafeConfidence = (value: number | undefined) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0.5;
  }
  return clamp(value, 0, 1);
};

export const applySelectionLimit = (ids: string[], limit = MAX_STYLE_SELECTION) => {
  const unique = Array.from(new Set(ids));
  const limited = unique.slice(0, limit);
  return {
    ids: limited,
    limited: limited.length < unique.length,
  };
};

export const toggleSelectionWithLimit = (
  currentIds: string[],
  assetId: string,
  limit = MAX_STYLE_SELECTION
) => {
  const current = Array.from(new Set(currentIds));
  const index = current.indexOf(assetId);
  if (index >= 0) {
    const next = [...current];
    next.splice(index, 1);
    return { ids: next, limited: false };
  }
  if (current.length >= limit) {
    return { ids: current, limited: true };
  }
  return {
    ids: [...current, assetId],
    limited: false,
  };
};

export const sanitizeTopPresetRecommendations = (
  incoming: Array<Partial<AiPresetRecommendation>> | undefined,
  candidatePresetIds: string[],
  topK = DEFAULT_TOP_K
) => {
  const candidates = Array.from(new Set(candidatePresetIds));
  const candidateSet = new Set(candidates);
  const output: AiPresetRecommendation[] = [];
  const used = new Set<string>();

  if (Array.isArray(incoming)) {
    for (const item of incoming) {
      const presetId = typeof item?.presetId === "string" ? item.presetId : "";
      if (!presetId || used.has(presetId) || !candidateSet.has(presetId)) {
        continue;
      }
      used.add(presetId);
      output.push({
        presetId,
        reason: toSafeReason(typeof item.reason === "string" ? item.reason : undefined),
        confidence: toSafeConfidence(
          typeof item.confidence === "number" ? item.confidence : undefined
        ),
      });
      if (output.length >= topK) {
        break;
      }
    }
  }

  return output;
};

export const findAutoApplyPreset = (
  presets: Preset[],
  recommendations: AiPresetRecommendation[]
) => {
  const first = recommendations[0];
  if (!first) {
    return undefined;
  }
  return presets.find((preset) => preset.id === first.presetId);
};

export const prioritizePresetsByRecommendation = (
  presets: Preset[],
  recommendations: AiPresetRecommendation[]
) => {
  if (recommendations.length === 0) {
    return presets;
  }
  const recommendationOrder = new Map<string, number>();
  recommendations.forEach((item, index) => {
    recommendationOrder.set(item.presetId, index);
  });

  return [...presets].sort((a, b) => {
    const aIndex = recommendationOrder.get(a.id);
    const bIndex = recommendationOrder.get(b.id);
    if (typeof aIndex === "number" && typeof bIndex === "number") {
      return aIndex - bIndex;
    }
    if (typeof aIndex === "number") {
      return -1;
    }
    if (typeof bIndex === "number") {
      return 1;
    }
    return 0;
  });
};

export const getRecommendedPresetIds = (recommendation: AssetAiRecommendation | undefined) => {
  if (!recommendation) {
    return [] as string[];
  }
  return recommendation.topPresets.map((item) => item.presetId);
};
