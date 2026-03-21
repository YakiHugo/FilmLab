import { createDefaultAdjustments, normalizeAdjustments } from "@/lib/adjustments";
import { asciiAdjustmentsEqual } from "@/lib/asciiRaster";
import type {
  EditingAdjustments,
  EditorAdjustmentGroupId,
  EditorAdjustmentGroupVisibility,
  EditorLayer,
} from "@/types";

const EDITOR_ADJUSTMENT_GROUP_KEYS = {
  basic: [
    "brightness",
    "exposure",
    "contrast",
    "highlights",
    "shadows",
    "whites",
    "blacks",
    "temperature",
    "tint",
    "hue",
    "temperatureKelvin",
    "tintMG",
    "vibrance",
    "saturation",
  ],
  effects: [
    "texture",
    "clarity",
    "dehaze",
    "vignette",
    "grain",
    "blur",
    "dilate",
    "grainSize",
    "grainRoughness",
    "glowIntensity",
    "glowMidtoneFocus",
    "glowBias",
    "glowRadius",
    "customLut",
    "ascii",
  ],
  detail: [
    "sharpening",
    "sharpenRadius",
    "sharpenDetail",
    "masking",
    "noiseReduction",
    "colorNoiseReduction",
  ],
} as const satisfies Record<EditorAdjustmentGroupId, readonly (keyof EditingAdjustments)[]>;

type EditorAdjustmentGroupKey =
  (typeof EDITOR_ADJUSTMENT_GROUP_KEYS)[EditorAdjustmentGroupId][number];

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

const cloneAdjustmentGroupValue = (
  key: EditorAdjustmentGroupKey,
  value: EditingAdjustments[EditorAdjustmentGroupKey]
) => {
  if (key === "customLut" || key === "ascii") {
    return value && typeof value === "object" ? { ...value } : undefined;
  }
  return value;
};

const assignDefaultAdjustmentGroupValue = (
  adjustments: EditingAdjustments,
  defaults: EditingAdjustments,
  key: EditorAdjustmentGroupKey
) => {
  const nextRecord = adjustments as Record<
    EditorAdjustmentGroupKey,
    EditingAdjustments[EditorAdjustmentGroupKey] | undefined
  >;
  const defaultRecord = defaults as Record<
    EditorAdjustmentGroupKey,
    EditingAdjustments[EditorAdjustmentGroupKey] | undefined
  >;
  nextRecord[key] = cloneAdjustmentGroupValue(
    key,
    defaultRecord[key]
  ) as EditingAdjustments[EditorAdjustmentGroupKey];
};

const resetAdjustmentGroup = (
  adjustments: EditingAdjustments,
  defaults: EditingAdjustments,
  groupId: EditorAdjustmentGroupId
) => {
  EDITOR_ADJUSTMENT_GROUP_KEYS[groupId].forEach((key) => {
    assignDefaultAdjustmentGroupValue(adjustments, defaults, key);
  });
};

const hasChangedAdjustmentGroupValue = (
  adjustments: EditingAdjustments,
  defaults: EditingAdjustments,
  key: EditorAdjustmentGroupKey
) => {
  if (key === "customLut") {
    return (
      adjustments.customLut?.enabled !== defaults.customLut?.enabled ||
      adjustments.customLut?.path !== defaults.customLut?.path ||
      adjustments.customLut?.size !== defaults.customLut?.size ||
      adjustments.customLut?.intensity !== defaults.customLut?.intensity
    );
  }
  if (key === "ascii") {
    return !asciiAdjustmentsEqual(adjustments.ascii, defaults.ascii);
  }
  return adjustments[key] !== defaults[key];
};

export const applyAdjustmentGroupVisibility = (
  adjustments: EditingAdjustments,
  visibility: EditorAdjustmentGroupVisibility | null | undefined
): EditingAdjustments => {
  const normalized = normalizeAdjustments(adjustments);
  const normalizedVisibility = normalizeEditorAdjustmentGroupVisibility(visibility);

  if (normalizedVisibility.basic && normalizedVisibility.effects && normalizedVisibility.detail) {
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

export const hasAdjustmentGroupChanges = (
  adjustments: EditingAdjustments,
  groupId: EditorAdjustmentGroupId
) => {
  const normalized = normalizeAdjustments(adjustments);
  const defaults = createDefaultAdjustments();
  return EDITOR_ADJUSTMENT_GROUP_KEYS[groupId].some((key) =>
    hasChangedAdjustmentGroupValue(normalized, defaults, key)
  );
};
