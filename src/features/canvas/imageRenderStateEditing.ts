import type { CanvasImageNumericFieldId } from "@/features/canvas/imageAdjustmentTypes";
import type { AsciiAdjustments } from "@/types";
import {
  createNeutralCanvasImageRenderState,
  type CanvasImageRenderStateV1,
  normalizeCanvasImageRenderState,
  type CarrierTransformNode,
  type ImageFilter2dEffectNode,
} from "@/render/image";

const DEFAULT_ASCII_ADJUSTMENTS: AsciiAdjustments = {
  enabled: false,
  charsetPreset: "standard",
  colorMode: "grayscale",
  cellSize: 12,
  characterSpacing: 1,
  contrast: 1,
  dither: "none",
  invert: false,
};

export type CanvasImageNumericFieldValues = Record<CanvasImageNumericFieldId, number>;

export type CanvasImageEditValues = CanvasImageNumericFieldValues & {
  ascii: AsciiAdjustments;
};

const cloneState = (state: CanvasImageRenderStateV1): CanvasImageRenderStateV1 => {
  if (typeof structuredClone === "function") {
    return normalizeCanvasImageRenderState(structuredClone(state) as CanvasImageRenderStateV1);
  }
  return normalizeCanvasImageRenderState(JSON.parse(JSON.stringify(state)) as CanvasImageRenderStateV1);
};

const resolveAsciiAdjustmentsFromState = (state: CanvasImageRenderStateV1): AsciiAdjustments => {
  const carrierTransform = normalizeCanvasImageRenderState(state).carrierTransforms.find(
    (candidate): candidate is Extract<CarrierTransformNode, { type: "ascii" }> =>
      candidate.type === "ascii" && candidate.enabled
  );
  return {
    ...DEFAULT_ASCII_ADJUSTMENTS,
    enabled: Boolean(carrierTransform),
    charsetPreset:
      carrierTransform?.params.preset === "blocks" || carrierTransform?.params.preset === "detailed"
        ? carrierTransform.params.preset
        : "standard",
    colorMode: carrierTransform?.params.colorMode === "full-color" ? "full-color" : "grayscale",
    cellSize: carrierTransform?.params.cellSize ?? 12,
    characterSpacing: carrierTransform?.params.characterSpacing ?? 1,
    contrast: carrierTransform?.params.contrast ?? 1,
    dither: carrierTransform?.params.dither ?? "none",
    invert: Boolean(carrierTransform?.params.invert),
  };
};

const resolveFilter2dPreviewValues = (state: CanvasImageRenderStateV1) => {
  const effect = state.effects.find(
    (candidate): candidate is ImageFilter2dEffectNode =>
      candidate.type === "filter2d" && candidate.enabled
  );
  return {
    brightness: effect?.params.brightness ?? 0,
    hue: effect?.params.hue ?? 0,
    blur: effect?.params.blur ?? 0,
    dilate: effect?.params.dilate ?? 0,
  };
};

const createCanvasImageEditValues = (
  state: CanvasImageRenderStateV1
): CanvasImageEditValues => {
  const normalizedState = normalizeCanvasImageRenderState(state);
  const filter2d = resolveFilter2dPreviewValues(normalizedState);
  return {
    exposure: normalizedState.develop.tone.exposure,
    contrast: normalizedState.develop.tone.contrast,
    highlights: normalizedState.develop.tone.highlights,
    shadows: normalizedState.develop.tone.shadows,
    whites: normalizedState.develop.tone.whites,
    blacks: normalizedState.develop.tone.blacks,
    temperature: normalizedState.develop.color.temperature,
    tint: normalizedState.develop.color.tint,
    hue: filter2d.hue,
    vibrance: normalizedState.develop.color.vibrance,
    saturation: normalizedState.develop.color.saturation,
    texture: normalizedState.develop.detail.texture,
    clarity: normalizedState.develop.detail.clarity,
    dehaze: normalizedState.develop.detail.dehaze,
    sharpening: normalizedState.develop.detail.sharpening,
    sharpenRadius: normalizedState.develop.detail.sharpenRadius,
    sharpenDetail: normalizedState.develop.detail.sharpenDetail,
    masking: normalizedState.develop.detail.masking,
    noiseReduction: normalizedState.develop.detail.noiseReduction,
    colorNoiseReduction: normalizedState.develop.detail.colorNoiseReduction,
    vignette: normalizedState.develop.fx.vignette,
    grain: normalizedState.develop.fx.grain,
    grainSize: normalizedState.develop.fx.grainSize,
    grainRoughness: normalizedState.develop.fx.grainRoughness,
    glowIntensity: normalizedState.develop.fx.glowIntensity,
    glowMidtoneFocus: normalizedState.develop.fx.glowMidtoneFocus,
    glowBias: normalizedState.develop.fx.glowBias,
    glowRadius: normalizedState.develop.fx.glowRadius,
    brightness: filter2d.brightness,
    blur: filter2d.blur,
    dilate: filter2d.dilate,
    ascii: resolveAsciiAdjustmentsFromState(normalizedState),
  };
};

const DEFAULT_NEUTRAL_CANVAS_IMAGE_RENDER_STATE = createNeutralCanvasImageRenderState();

export const DEFAULT_CANVAS_IMAGE_EDIT_VALUES: CanvasImageEditValues =
  createCanvasImageEditValues(DEFAULT_NEUTRAL_CANVAS_IMAGE_RENDER_STATE);

export const DEFAULT_CANVAS_ASCII_ADJUSTMENTS: AsciiAdjustments = {
  ...DEFAULT_CANVAS_IMAGE_EDIT_VALUES.ascii,
};

const createDefaultAsciiCarrierTransform = (): Extract<CarrierTransformNode, { type: "ascii" }> => ({
  id: "canvas-ascii",
  type: "ascii",
  enabled: false,
  analysisSource: "style",
  params: {
    renderMode: "glyph",
    preset: "standard",
    cellSize: DEFAULT_CANVAS_ASCII_ADJUSTMENTS.cellSize,
    characterSpacing: DEFAULT_CANVAS_ASCII_ADJUSTMENTS.characterSpacing,
    density: 1,
    coverage: 1,
    edgeEmphasis: 0,
    brightness: 0,
    contrast: DEFAULT_CANVAS_ASCII_ADJUSTMENTS.contrast,
    dither: DEFAULT_CANVAS_ASCII_ADJUSTMENTS.dither,
    colorMode: DEFAULT_CANVAS_ASCII_ADJUSTMENTS.colorMode,
    foregroundOpacity: 1,
    foregroundBlendMode: "source-over",
    backgroundMode: "cell-solid",
    backgroundBlur: 0,
    backgroundOpacity: 1,
    backgroundColor: "#000000",
    invert: false,
    gridOverlay: false,
  },
});

const createDefaultFilter2dEffect = (): ImageFilter2dEffectNode => ({
  id: "canvas-filter2d",
  type: "filter2d",
  enabled: false,
  placement: "finalize",
  params: {
    brightness: 0,
    hue: 0,
    blur: 0,
    dilate: 0,
  },
});

const upsertAsciiCarrierTransform = (
  state: CanvasImageRenderStateV1,
  updater: (
    transform: Extract<CarrierTransformNode, { type: "ascii" }>
  ) => Extract<CarrierTransformNode, { type: "ascii" }>
) => {
  const next = cloneState(state);
  const index = next.carrierTransforms.findIndex((transform) => transform.type === "ascii");
  const current =
    index >= 0
      ? (next.carrierTransforms[index] as Extract<CarrierTransformNode, { type: "ascii" }>)
      : createDefaultAsciiCarrierTransform();
  const updated = updater(current);
  if (index >= 0) {
    next.carrierTransforms[index] = updated;
  } else {
    next.carrierTransforms.push(updated);
  }
  return next;
};

const upsertFilter2dEffect = (
  state: CanvasImageRenderStateV1,
  updater: (effect: ImageFilter2dEffectNode) => ImageFilter2dEffectNode
) => {
  const next = cloneState(state);
  const index = next.effects.findIndex((effect) => effect.type === "filter2d");
  const current =
    index >= 0 ? (next.effects[index] as ImageFilter2dEffectNode) : createDefaultFilter2dEffect();
  const updated = updater(current);
  if (index >= 0) {
    next.effects[index] = updated;
  } else {
    next.effects.push(updated);
  }
  return next;
};

export const getCanvasImageEditValues = (
  state: CanvasImageRenderStateV1
): CanvasImageEditValues => createCanvasImageEditValues(state);

export const applyNumericFieldToRenderState = (
  state: CanvasImageRenderStateV1,
  fieldId: CanvasImageNumericFieldId,
  value: number
) => {
  const next = cloneState(state);
  switch (fieldId) {
    case "exposure":
    case "contrast":
    case "highlights":
    case "shadows":
    case "whites":
    case "blacks":
      next.develop.tone[fieldId] = value;
      return next;
    case "temperature":
    case "tint":
    case "vibrance":
    case "saturation":
      next.develop.color[fieldId] = value;
      return next;
    case "texture":
    case "clarity":
    case "dehaze":
    case "sharpening":
    case "sharpenRadius":
    case "sharpenDetail":
    case "masking":
    case "noiseReduction":
    case "colorNoiseReduction":
      next.develop.detail[fieldId] = value;
      return next;
    case "vignette":
    case "grain":
    case "grainSize":
    case "grainRoughness":
    case "glowIntensity":
    case "glowMidtoneFocus":
    case "glowBias":
    case "glowRadius":
      next.develop.fx[fieldId] = value;
      return next;
    case "hue":
      return upsertFilter2dEffect(next, (effect) => ({
        ...effect,
        enabled:
          Math.abs(effect.params.brightness) > 0.001 ||
          Math.abs(value) > 0.001 ||
          effect.params.blur > 0.001 ||
          effect.params.dilate > 0.001,
        params: {
          ...effect.params,
          hue: value,
        },
      }));
    case "brightness":
      return upsertFilter2dEffect(next, (effect) => ({
        ...effect,
        enabled:
          Math.abs(value) > 0.001 ||
          Math.abs(effect.params.hue) > 0.001 ||
          effect.params.blur > 0.001 ||
          effect.params.dilate > 0.001,
        params: {
          ...effect.params,
          brightness: value,
        },
      }));
    case "blur":
      return upsertFilter2dEffect(next, (effect) => ({
        ...effect,
        enabled:
          Math.abs(effect.params.brightness) > 0.001 ||
          Math.abs(effect.params.hue) > 0.001 ||
          value > 0.001 ||
          effect.params.dilate > 0.001,
        params: {
          ...effect.params,
          blur: value,
        },
      }));
    case "dilate":
      return upsertFilter2dEffect(next, (effect) => ({
        ...effect,
        enabled:
          Math.abs(effect.params.brightness) > 0.001 ||
          Math.abs(effect.params.hue) > 0.001 ||
          effect.params.blur > 0.001 ||
          value > 0.001,
        params: {
          ...effect.params,
          dilate: value,
        },
      }));
    default:
      return next;
  }
};

export const applyAsciiAdjustmentsToRenderState = (
  state: CanvasImageRenderStateV1,
  partial: Partial<AsciiAdjustments>
) =>
  upsertAsciiCarrierTransform(state, (transform) => ({
    ...transform,
    enabled: partial.enabled ?? transform.enabled,
    params: {
      ...transform.params,
      preset: partial.charsetPreset ?? transform.params.preset,
      colorMode: partial.colorMode ?? transform.params.colorMode,
      cellSize: partial.cellSize ?? transform.params.cellSize,
      characterSpacing: partial.characterSpacing ?? transform.params.characterSpacing,
      contrast: partial.contrast ?? transform.params.contrast,
      dither: partial.dither ?? transform.params.dither,
      invert: partial.invert ?? transform.params.invert,
    },
  }));

export const resetRenderStateForNumericFields = (
  state: CanvasImageRenderStateV1,
  fieldIds: CanvasImageNumericFieldId[]
) =>
  fieldIds.reduce(
    (current, fieldId) =>
      applyNumericFieldToRenderState(
        current,
        fieldId,
        Number(DEFAULT_CANVAS_IMAGE_EDIT_VALUES[fieldId])
      ),
    state
  );

export const resolveCanvasImageFilmProfileId = (state: CanvasImageRenderStateV1) =>
  state.film.profileId ?? "none";

export const setCanvasImageFilmProfileId = (
  state: CanvasImageRenderStateV1,
  value: string | undefined
) => {
  const next = cloneState(state);
  next.film.profileId = value ?? null;
  next.film.profile = undefined;
  return next;
};
