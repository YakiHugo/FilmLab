import { createDefaultAdjustments } from "@/lib/adjustments";
import type { NumericAdjustmentKey } from "@/features/editor/types";
import type { AsciiAdjustments, EditingAdjustments } from "@/types";
import {
  type CanvasImageRenderStateV1,
  type ImageAsciiEffectNode,
  type ImageFilter2dEffectNode,
} from "@/render/image";

const DEFAULT_ADJUSTMENTS = createDefaultAdjustments();
const DEFAULT_ASCII_ADJUSTMENTS: AsciiAdjustments = DEFAULT_ADJUSTMENTS.ascii ?? {
  enabled: false,
  charsetPreset: "standard",
  colorMode: "grayscale",
  cellSize: 12,
  characterSpacing: 1,
  contrast: 1,
  dither: "none",
  invert: false,
};

export type CanvasImageAdjustmentView = Omit<
  EditingAdjustments,
  "ascii" | "blur" | "brightness" | "dilate" | "hue"
> & {
  ascii: AsciiAdjustments;
  blur: number;
  brightness: number;
  dilate: number;
  hue: number;
};

export const DEFAULT_CANVAS_IMAGE_ADJUSTMENT_VIEW: CanvasImageAdjustmentView = {
  ...DEFAULT_ADJUSTMENTS,
  ascii: DEFAULT_ASCII_ADJUSTMENTS,
  blur: DEFAULT_ADJUSTMENTS.blur ?? 0,
  brightness: DEFAULT_ADJUSTMENTS.brightness ?? 0,
  dilate: DEFAULT_ADJUSTMENTS.dilate ?? 0,
  hue: DEFAULT_ADJUSTMENTS.hue ?? 0,
};

const cloneState = (state: CanvasImageRenderStateV1): CanvasImageRenderStateV1 => {
  if (typeof structuredClone === "function") {
    return structuredClone(state) as CanvasImageRenderStateV1;
  }
  return JSON.parse(JSON.stringify(state)) as CanvasImageRenderStateV1;
};

const createDefaultAsciiEffect = (): ImageAsciiEffectNode => ({
  id: "canvas-ascii",
  type: "ascii",
  enabled: false,
  placement: "style",
  analysisSource: "style",
  params: {
    renderMode: "glyph",
    preset: "standard",
    cellSize: DEFAULT_ADJUSTMENTS.ascii?.cellSize ?? 12,
    characterSpacing: DEFAULT_ADJUSTMENTS.ascii?.characterSpacing ?? 1,
    density: 1,
    coverage: 1,
    edgeEmphasis: 0,
    brightness: 0,
    contrast: DEFAULT_ADJUSTMENTS.ascii?.contrast ?? 1,
    dither: DEFAULT_ADJUSTMENTS.ascii?.dither ?? "none",
    colorMode: DEFAULT_ADJUSTMENTS.ascii?.colorMode ?? "grayscale",
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

const upsertAsciiEffect = (
  state: CanvasImageRenderStateV1,
  updater: (effect: ImageAsciiEffectNode) => ImageAsciiEffectNode
) => {
  const next = cloneState(state);
  const index = next.effects.findIndex((effect) => effect.type === "ascii");
  const current = index >= 0 ? (next.effects[index] as ImageAsciiEffectNode) : createDefaultAsciiEffect();
  const updated = updater(current);
  if (index >= 0) {
    next.effects[index] = updated;
  } else {
    next.effects.push(updated);
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

export const getCanvasImageAdjustmentView = (
  state: CanvasImageRenderStateV1
): CanvasImageAdjustmentView =>
  ({
    ...DEFAULT_CANVAS_IMAGE_ADJUSTMENT_VIEW,
    exposure: state.develop.tone.exposure,
    contrast: state.develop.tone.contrast,
    highlights: state.develop.tone.highlights,
    shadows: state.develop.tone.shadows,
    whites: state.develop.tone.whites,
    blacks: state.develop.tone.blacks,
    temperature: state.develop.color.temperature,
    tint: state.develop.color.tint,
    hue: resolveFilter2dPreviewValues(state).hue,
    vibrance: state.develop.color.vibrance,
    saturation: state.develop.color.saturation,
    texture: state.develop.detail.texture,
    clarity: state.develop.detail.clarity,
    dehaze: state.develop.detail.dehaze,
    sharpening: state.develop.detail.sharpening,
    sharpenRadius: state.develop.detail.sharpenRadius,
    sharpenDetail: state.develop.detail.sharpenDetail,
    masking: state.develop.detail.masking,
    noiseReduction: state.develop.detail.noiseReduction,
    colorNoiseReduction: state.develop.detail.colorNoiseReduction,
    vignette: state.develop.fx.vignette,
    grain: state.develop.fx.grain,
    grainSize: state.develop.fx.grainSize,
    grainRoughness: state.develop.fx.grainRoughness,
    glowIntensity: state.develop.fx.glowIntensity,
    glowMidtoneFocus: state.develop.fx.glowMidtoneFocus,
    glowBias: state.develop.fx.glowBias,
    glowRadius: state.develop.fx.glowRadius,
    brightness: resolveFilter2dPreviewValues(state).brightness,
    blur: resolveFilter2dPreviewValues(state).blur,
    dilate: resolveFilter2dPreviewValues(state).dilate,
    ascii: resolveAsciiAdjustmentsFromState(state),
  }) as CanvasImageAdjustmentView;

const resolveAsciiAdjustmentsFromState = (state: CanvasImageRenderStateV1): AsciiAdjustments => {
  const effect = state.effects.find(
    (candidate): candidate is ImageAsciiEffectNode =>
      candidate.type === "ascii" && candidate.enabled
  );
  return {
    ...DEFAULT_ASCII_ADJUSTMENTS,
    enabled: Boolean(effect),
    charsetPreset:
      effect?.params.preset === "blocks" || effect?.params.preset === "detailed"
        ? effect.params.preset
        : "standard",
    colorMode: effect?.params.colorMode === "full-color" ? "full-color" : "grayscale",
    cellSize: effect?.params.cellSize ?? 12,
    characterSpacing: effect?.params.characterSpacing ?? 1,
    contrast: effect?.params.contrast ?? 1,
    dither: effect?.params.dither ?? "none",
    invert: Boolean(effect?.params.invert),
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

export const applyNumericAdjustmentToRenderState = (
  state: CanvasImageRenderStateV1,
  key: NumericAdjustmentKey,
  value: number
) => {
  const next = cloneState(state);
  switch (key) {
    case "exposure":
    case "contrast":
    case "highlights":
    case "shadows":
    case "whites":
    case "blacks":
      next.develop.tone[key] = value;
      return next;
    case "temperature":
    case "tint":
    case "vibrance":
    case "saturation":
      next.develop.color[key] = value;
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
      next.develop.detail[key] = value;
      return next;
    case "vignette":
    case "grain":
    case "grainSize":
    case "grainRoughness":
    case "glowIntensity":
    case "glowMidtoneFocus":
    case "glowBias":
    case "glowRadius":
      next.develop.fx[key] = value;
      return next;
    case "hue":
      return upsertFilter2dEffect(next, (effect) => ({
        ...effect,
        enabled: Math.abs(effect.params.brightness) > 0.001 || Math.abs(value) > 0.001 || effect.params.blur > 0.001 || effect.params.dilate > 0.001,
        params: {
          ...effect.params,
          hue: value,
        },
      }));
    case "brightness":
      return upsertFilter2dEffect(next, (effect) => ({
        ...effect,
        enabled: Math.abs(value) > 0.001 || Math.abs(effect.params.hue) > 0.001 || effect.params.blur > 0.001 || effect.params.dilate > 0.001,
        params: {
          ...effect.params,
          brightness: value,
        },
      }));
    case "blur":
      return upsertFilter2dEffect(next, (effect) => ({
        ...effect,
        enabled: Math.abs(effect.params.brightness) > 0.001 || Math.abs(effect.params.hue) > 0.001 || value > 0.001 || effect.params.dilate > 0.001,
        params: {
          ...effect.params,
          blur: value,
        },
      }));
    case "dilate":
      return upsertFilter2dEffect(next, (effect) => ({
        ...effect,
        enabled: Math.abs(effect.params.brightness) > 0.001 || Math.abs(effect.params.hue) > 0.001 || effect.params.blur > 0.001 || value > 0.001,
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
  upsertAsciiEffect(state, (effect) => ({
    ...effect,
    enabled: partial.enabled ?? effect.enabled,
    params: {
      ...effect.params,
      preset: partial.charsetPreset ?? effect.params.preset,
      colorMode: partial.colorMode ?? effect.params.colorMode,
      cellSize: partial.cellSize ?? effect.params.cellSize,
      characterSpacing: partial.characterSpacing ?? effect.params.characterSpacing,
      contrast: partial.contrast ?? effect.params.contrast,
      dither: partial.dither ?? effect.params.dither,
      invert: partial.invert ?? effect.params.invert,
    },
  }));

export const resetRenderStateForAdjustmentKeys = (
  state: CanvasImageRenderStateV1,
  keys: NumericAdjustmentKey[]
) =>
  keys.reduce(
    (current, key) =>
      applyNumericAdjustmentToRenderState(
        current,
        key,
        Number(DEFAULT_ADJUSTMENTS[key] ?? 0)
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
