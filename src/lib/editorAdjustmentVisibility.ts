import { createDefaultAdjustments, normalizeAdjustments } from "@/lib/adjustments";
import type {
  EditingAdjustments,
  EditorAdjustmentGroupId,
  EditorAdjustmentGroupVisibility,
  EditorLayer,
} from "@/types";

export const DEFAULT_EDITOR_ADJUSTMENT_GROUP_VISIBILITY: EditorAdjustmentGroupVisibility = {
  basic: true,
  effects: true,
  detail: true,
};

export const normalizeEditorAdjustmentGroupVisibility = (
  value: unknown
): EditorAdjustmentGroupVisibility => {
  const record =
    value && typeof value === "object"
      ? (value as Partial<Record<EditorAdjustmentGroupId, unknown>>)
      : null;

  return {
    basic: record?.basic !== false,
    effects: record?.effects !== false,
    detail: record?.detail !== false,
  };
};

export const resolveLayerAdjustmentVisibility = (
  layer: Pick<EditorLayer, "adjustmentVisibility"> | null | undefined
) => normalizeEditorAdjustmentGroupVisibility(layer?.adjustmentVisibility);

const resetAdjustmentGroup = (
  adjustments: EditingAdjustments,
  defaults: EditingAdjustments,
  groupId: EditorAdjustmentGroupId
) => {
  if (groupId === "basic") {
    adjustments.exposure = defaults.exposure;
    adjustments.contrast = defaults.contrast;
    adjustments.highlights = defaults.highlights;
    adjustments.shadows = defaults.shadows;
    adjustments.whites = defaults.whites;
    adjustments.blacks = defaults.blacks;
    adjustments.temperature = defaults.temperature;
    adjustments.tint = defaults.tint;
    adjustments.temperatureKelvin = defaults.temperatureKelvin;
    adjustments.tintMG = defaults.tintMG;
    adjustments.vibrance = defaults.vibrance;
    adjustments.saturation = defaults.saturation;
    return;
  }

  if (groupId === "effects") {
    adjustments.texture = defaults.texture;
    adjustments.clarity = defaults.clarity;
    adjustments.dehaze = defaults.dehaze;
    adjustments.vignette = defaults.vignette;
    adjustments.grain = defaults.grain;
    adjustments.grainSize = defaults.grainSize;
    adjustments.grainRoughness = defaults.grainRoughness;
    adjustments.glowIntensity = defaults.glowIntensity;
    adjustments.glowMidtoneFocus = defaults.glowMidtoneFocus;
    adjustments.glowBias = defaults.glowBias;
    adjustments.glowRadius = defaults.glowRadius;
    adjustments.customLut = defaults.customLut;
    return;
  }

  adjustments.sharpening = defaults.sharpening;
  adjustments.sharpenRadius = defaults.sharpenRadius;
  adjustments.sharpenDetail = defaults.sharpenDetail;
  adjustments.masking = defaults.masking;
  adjustments.noiseReduction = defaults.noiseReduction;
  adjustments.colorNoiseReduction = defaults.colorNoiseReduction;
};

export const applyAdjustmentGroupVisibility = (
  adjustments: EditingAdjustments,
  visibility: EditorAdjustmentGroupVisibility | null | undefined
): EditingAdjustments => {
  const normalized = normalizeAdjustments(adjustments);
  const normalizedVisibility = normalizeEditorAdjustmentGroupVisibility(visibility);

  if (
    normalizedVisibility.basic &&
    normalizedVisibility.effects &&
    normalizedVisibility.detail
  ) {
    return normalized;
  }

  const nextAdjustments = { ...normalized };
  const defaults = createDefaultAdjustments();

  (Object.keys(normalizedVisibility) as EditorAdjustmentGroupId[]).forEach((groupId) => {
    if (normalizedVisibility[groupId]) {
      return;
    }
    resetAdjustmentGroup(nextAdjustments, defaults, groupId);
  });

  return nextAdjustments;
};
