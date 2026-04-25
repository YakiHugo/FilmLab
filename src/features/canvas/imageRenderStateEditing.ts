import type { CanvasImageNumericFieldId } from "@/features/canvas/imageAdjustmentTypes";
import type {
  AsciiAdjustments,
  AsciiBackgroundMode,
  AsciiCharsetPreset,
  AsciiColorMode,
  AsciiDitherMode,
  AsciiForegroundBlendMode,
  AsciiRenderMode,
  ChannelDriftAdjustments,
  HalftoneAdjustments,
  HalftoneColorMode,
  HalftoneShape,
} from "@/types";
import {
  createNeutralCanvasImageRenderState,
  type CanvasImageRenderStateV1,
  normalizeCanvasImageRenderState,
  type CarrierTransformNode,
  type ImageFilter2dEffectNode,
  type SignalDamageNode,
} from "@/render/image";

const CHARSET_PRESET_VALUES = ["standard", "minimal", "blocks", "detailed", "custom"] as const;
const COLOR_MODE_VALUES = ["grayscale", "full-color", "duotone"] as const;
const DITHER_VALUES = ["none", "floyd-steinberg"] as const;
const RENDER_MODE_VALUES = ["glyph", "dot"] as const;
const BACKGROUND_MODE_VALUES = ["none", "solid", "cell-solid", "blurred-source"] as const;
const FOREGROUND_BLEND_VALUES = [
  "source-over",
  "multiply",
  "screen",
  "overlay",
  "soft-light",
] as const;

const isCharsetPreset = (value: unknown): value is AsciiCharsetPreset =>
  typeof value === "string" && (CHARSET_PRESET_VALUES as readonly string[]).includes(value);
const isColorMode = (value: unknown): value is AsciiColorMode =>
  typeof value === "string" && (COLOR_MODE_VALUES as readonly string[]).includes(value);
const isDitherMode = (value: unknown): value is AsciiDitherMode =>
  typeof value === "string" && (DITHER_VALUES as readonly string[]).includes(value);
const isRenderMode = (value: unknown): value is AsciiRenderMode =>
  typeof value === "string" && (RENDER_MODE_VALUES as readonly string[]).includes(value);
const isBackgroundMode = (value: unknown): value is AsciiBackgroundMode =>
  typeof value === "string" && (BACKGROUND_MODE_VALUES as readonly string[]).includes(value);
const isForegroundBlendMode = (value: unknown): value is AsciiForegroundBlendMode =>
  typeof value === "string" && (FOREGROUND_BLEND_VALUES as readonly string[]).includes(value);

const HALFTONE_SHAPE_VALUES = ["circle", "diamond", "line", "square"] as const;
const HALFTONE_COLOR_MODE_VALUES = ["mono", "cmyk", "rgb"] as const;

const isHalftoneShape = (value: unknown): value is HalftoneShape =>
  typeof value === "string" && (HALFTONE_SHAPE_VALUES as readonly string[]).includes(value);
const isHalftoneColorMode = (value: unknown): value is HalftoneColorMode =>
  typeof value === "string" && (HALFTONE_COLOR_MODE_VALUES as readonly string[]).includes(value);

const DEFAULT_HALFTONE_ADJUSTMENTS: HalftoneAdjustments = {
  enabled: false,
  frequency: 30,
  angle: 45,
  shape: "circle",
  colorMode: "mono",
  dotScale: 1,
  contrast: 1,
  invert: false,
  backgroundColor: "#000000",
  backgroundOpacity: 1,
};

const DEFAULT_CHANNEL_DRIFT_ADJUSTMENTS: ChannelDriftAdjustments = {
  enabled: false,
  redOffsetX: 5,
  redOffsetY: 0,
  greenOffsetX: -3,
  greenOffsetY: 2,
  blueOffsetX: 0,
  blueOffsetY: -4,
  intensity: 0.5,
};

const DEFAULT_ASCII_ADJUSTMENTS: AsciiAdjustments = {
  enabled: false,
  // Defaults are tuned to match ascii-magic.com's out-of-the-box look, which
  // treats ASCII as a "character texture overlay on blurred source" — not as
  // large readable characters on a solid background. The visual feel comes
  // from the source image showing through the blur, with tiny characters
  // adding a screen/halftone-like pattern on top.
  charsetPreset: "standard",
  customCharset: "",
  // Invert ON: dense chars represent bright source areas (ascii-magic default).
  invert: true,
  brightness: 0,
  contrast: 1,
  density: 1,
  // Coverage < 1 leaves the darkest cells empty for breathing room.
  coverage: 0.8,
  edgeEmphasis: 0,
  renderMode: "glyph",
  // Small cells: characters are texture elements, not readable text.
  cellSize: 8,
  characterSpacing: 1,
  foregroundOpacity: 1,
  foregroundBlendMode: "source-over",
  gridOverlay: false,
  // Blurred source image as background is THE key visual element. The image
  // itself stays visible through the blur; characters overlay as texture.
  backgroundMode: "blurred-source",
  backgroundColor: "#000000",
  backgroundBlur: 8,
  backgroundOpacity: 0.7,
  // Full-color: each character takes the source pixel's color, preserving the
  // image's palette through the character texture. "grayscale" draws every char
  // in the same white, which washes out the source and makes it look like a
  // low-res pixelation instead of ASCII.
  colorMode: "full-color",
  dither: "none",
};

export type CanvasImageNumericFieldValues = Record<CanvasImageNumericFieldId, number>;

export type CanvasImageEditValues = CanvasImageNumericFieldValues & {
  ascii: AsciiAdjustments;
  halftone: HalftoneAdjustments;
  channelDrift: ChannelDriftAdjustments;
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
  if (!carrierTransform) {
    return { ...DEFAULT_ASCII_ADJUSTMENTS };
  }
  const params = carrierTransform.params;
  return {
    ...DEFAULT_ASCII_ADJUSTMENTS,
    enabled: true,
    charsetPreset: isCharsetPreset(params.preset) ? params.preset : "standard",
    customCharset:
      typeof params.customCharset === "string" ? params.customCharset : "",
    invert: Boolean(params.invert),
    brightness: typeof params.brightness === "number" ? params.brightness : 0,
    contrast: typeof params.contrast === "number" ? params.contrast : 1,
    density: typeof params.density === "number" ? params.density : 1,
    coverage: typeof params.coverage === "number" ? params.coverage : 1,
    edgeEmphasis: typeof params.edgeEmphasis === "number" ? params.edgeEmphasis : 0,
    renderMode: isRenderMode(params.renderMode) ? params.renderMode : "glyph",
    cellSize: typeof params.cellSize === "number" ? params.cellSize : 12,
    characterSpacing:
      typeof params.characterSpacing === "number" ? params.characterSpacing : 1,
    foregroundOpacity:
      typeof params.foregroundOpacity === "number" ? params.foregroundOpacity : 1,
    foregroundBlendMode: isForegroundBlendMode(params.foregroundBlendMode)
      ? params.foregroundBlendMode
      : "source-over",
    gridOverlay: Boolean(params.gridOverlay),
    backgroundMode: isBackgroundMode(params.backgroundMode)
      ? params.backgroundMode
      : "cell-solid",
    backgroundColor:
      typeof params.backgroundColor === "string" && params.backgroundColor
        ? params.backgroundColor
        : "#000000",
    backgroundBlur: typeof params.backgroundBlur === "number" ? params.backgroundBlur : 0,
    backgroundOpacity:
      typeof params.backgroundOpacity === "number" ? params.backgroundOpacity : 1,
    colorMode: isColorMode(params.colorMode) ? params.colorMode : "grayscale",
    dither: isDitherMode(params.dither) ? params.dither : "none",
  };
};

const resolveHalftoneAdjustmentsFromState = (
  state: CanvasImageRenderStateV1
): HalftoneAdjustments => {
  const carrier = normalizeCanvasImageRenderState(state).carrierTransforms.find(
    (candidate): candidate is Extract<CarrierTransformNode, { type: "halftone" }> =>
      candidate.type === "halftone" && candidate.enabled
  );
  if (!carrier) {
    return { ...DEFAULT_HALFTONE_ADJUSTMENTS };
  }
  const p = carrier.params;
  return {
    ...DEFAULT_HALFTONE_ADJUSTMENTS,
    enabled: true,
    frequency: typeof p.frequency === "number" ? p.frequency : 30,
    angle: typeof p.angle === "number" ? p.angle : 45,
    shape: isHalftoneShape(p.shape) ? p.shape : "circle",
    colorMode: isHalftoneColorMode(p.colorMode) ? p.colorMode : "mono",
    dotScale: typeof p.dotScale === "number" ? p.dotScale : 1,
    contrast: typeof p.contrast === "number" ? p.contrast : 1,
    invert: Boolean(p.invert),
    backgroundColor:
      typeof p.backgroundColor === "string" && p.backgroundColor
        ? p.backgroundColor
        : "#000000",
    backgroundOpacity: typeof p.backgroundOpacity === "number" ? p.backgroundOpacity : 1,
  };
};

const resolveChannelDriftAdjustmentsFromState = (
  state: CanvasImageRenderStateV1
): ChannelDriftAdjustments => {
  const node = normalizeCanvasImageRenderState(state).signalDamage.find(
    (candidate): candidate is Extract<SignalDamageNode, { type: "channel-drift" }> =>
      candidate.type === "channel-drift" && candidate.enabled
  );
  if (!node) {
    return { ...DEFAULT_CHANNEL_DRIFT_ADJUSTMENTS };
  }
  const p = node.params;
  return {
    ...DEFAULT_CHANNEL_DRIFT_ADJUSTMENTS,
    enabled: true,
    redOffsetX: typeof p.redOffsetX === "number" ? p.redOffsetX : 5,
    redOffsetY: typeof p.redOffsetY === "number" ? p.redOffsetY : 0,
    greenOffsetX: typeof p.greenOffsetX === "number" ? p.greenOffsetX : -3,
    greenOffsetY: typeof p.greenOffsetY === "number" ? p.greenOffsetY : 2,
    blueOffsetX: typeof p.blueOffsetX === "number" ? p.blueOffsetX : 0,
    blueOffsetY: typeof p.blueOffsetY === "number" ? p.blueOffsetY : -4,
    intensity: typeof p.intensity === "number" ? p.intensity : 0.5,
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
    halftone: resolveHalftoneAdjustmentsFromState(normalizedState),
    channelDrift: resolveChannelDriftAdjustmentsFromState(normalizedState),
  };
};

const DEFAULT_NEUTRAL_CANVAS_IMAGE_RENDER_STATE = createNeutralCanvasImageRenderState();

export const DEFAULT_CANVAS_IMAGE_EDIT_VALUES: CanvasImageEditValues =
  createCanvasImageEditValues(DEFAULT_NEUTRAL_CANVAS_IMAGE_RENDER_STATE);

export const DEFAULT_CANVAS_ASCII_ADJUSTMENTS: AsciiAdjustments = {
  ...DEFAULT_CANVAS_IMAGE_EDIT_VALUES.ascii,
};

export const DEFAULT_CANVAS_HALFTONE_ADJUSTMENTS: HalftoneAdjustments = {
  ...DEFAULT_CANVAS_IMAGE_EDIT_VALUES.halftone,
};

export const DEFAULT_CANVAS_CHANNEL_DRIFT_ADJUSTMENTS: ChannelDriftAdjustments = {
  ...DEFAULT_CANVAS_IMAGE_EDIT_VALUES.channelDrift,
};

const createDefaultAsciiCarrierTransform = (): Extract<CarrierTransformNode, { type: "ascii" }> => ({
  id: "canvas-ascii",
  type: "ascii",
  enabled: false,
  analysisSource: "style",
  params: {
    renderMode: DEFAULT_CANVAS_ASCII_ADJUSTMENTS.renderMode,
    preset: DEFAULT_CANVAS_ASCII_ADJUSTMENTS.charsetPreset,
    customCharset: DEFAULT_CANVAS_ASCII_ADJUSTMENTS.customCharset || null,
    cellSize: DEFAULT_CANVAS_ASCII_ADJUSTMENTS.cellSize,
    characterSpacing: DEFAULT_CANVAS_ASCII_ADJUSTMENTS.characterSpacing,
    density: DEFAULT_CANVAS_ASCII_ADJUSTMENTS.density,
    coverage: DEFAULT_CANVAS_ASCII_ADJUSTMENTS.coverage,
    edgeEmphasis: DEFAULT_CANVAS_ASCII_ADJUSTMENTS.edgeEmphasis,
    brightness: DEFAULT_CANVAS_ASCII_ADJUSTMENTS.brightness,
    contrast: DEFAULT_CANVAS_ASCII_ADJUSTMENTS.contrast,
    dither: DEFAULT_CANVAS_ASCII_ADJUSTMENTS.dither,
    colorMode: DEFAULT_CANVAS_ASCII_ADJUSTMENTS.colorMode,
    foregroundOpacity: DEFAULT_CANVAS_ASCII_ADJUSTMENTS.foregroundOpacity,
    foregroundBlendMode: DEFAULT_CANVAS_ASCII_ADJUSTMENTS.foregroundBlendMode,
    backgroundMode: DEFAULT_CANVAS_ASCII_ADJUSTMENTS.backgroundMode,
    backgroundBlur: DEFAULT_CANVAS_ASCII_ADJUSTMENTS.backgroundBlur,
    backgroundOpacity: DEFAULT_CANVAS_ASCII_ADJUSTMENTS.backgroundOpacity,
    backgroundColor: DEFAULT_CANVAS_ASCII_ADJUSTMENTS.backgroundColor,
    invert: DEFAULT_CANVAS_ASCII_ADJUSTMENTS.invert,
    gridOverlay: DEFAULT_CANVAS_ASCII_ADJUSTMENTS.gridOverlay,
  },
});

const createDefaultHalftoneCarrierTransform = (): Extract<
  CarrierTransformNode,
  { type: "halftone" }
> => ({
  id: "canvas-halftone",
  type: "halftone",
  enabled: false,
  analysisSource: "style",
  params: {
    frequency: DEFAULT_CANVAS_HALFTONE_ADJUSTMENTS.frequency,
    angle: DEFAULT_CANVAS_HALFTONE_ADJUSTMENTS.angle,
    shape: DEFAULT_CANVAS_HALFTONE_ADJUSTMENTS.shape,
    colorMode: DEFAULT_CANVAS_HALFTONE_ADJUSTMENTS.colorMode,
    dotScale: DEFAULT_CANVAS_HALFTONE_ADJUSTMENTS.dotScale,
    contrast: DEFAULT_CANVAS_HALFTONE_ADJUSTMENTS.contrast,
    invert: DEFAULT_CANVAS_HALFTONE_ADJUSTMENTS.invert,
    backgroundColor: DEFAULT_CANVAS_HALFTONE_ADJUSTMENTS.backgroundColor,
    backgroundOpacity: DEFAULT_CANVAS_HALFTONE_ADJUSTMENTS.backgroundOpacity,
  },
});

const createDefaultChannelDriftDamage = (): Extract<
  SignalDamageNode,
  { type: "channel-drift" }
> => ({
  id: "canvas-channel-drift",
  type: "channel-drift",
  enabled: false,
  params: {
    redOffsetX: DEFAULT_CANVAS_CHANNEL_DRIFT_ADJUSTMENTS.redOffsetX,
    redOffsetY: DEFAULT_CANVAS_CHANNEL_DRIFT_ADJUSTMENTS.redOffsetY,
    greenOffsetX: DEFAULT_CANVAS_CHANNEL_DRIFT_ADJUSTMENTS.greenOffsetX,
    greenOffsetY: DEFAULT_CANVAS_CHANNEL_DRIFT_ADJUSTMENTS.greenOffsetY,
    blueOffsetX: DEFAULT_CANVAS_CHANNEL_DRIFT_ADJUSTMENTS.blueOffsetX,
    blueOffsetY: DEFAULT_CANVAS_CHANNEL_DRIFT_ADJUSTMENTS.blueOffsetY,
    intensity: DEFAULT_CANVAS_CHANNEL_DRIFT_ADJUSTMENTS.intensity,
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

const upsertHalftoneCarrierTransform = (
  state: CanvasImageRenderStateV1,
  updater: (
    transform: Extract<CarrierTransformNode, { type: "halftone" }>
  ) => Extract<CarrierTransformNode, { type: "halftone" }>
) => {
  const next = cloneState(state);
  const index = next.carrierTransforms.findIndex((t) => t.type === "halftone");
  const current =
    index >= 0
      ? (next.carrierTransforms[index] as Extract<CarrierTransformNode, { type: "halftone" }>)
      : createDefaultHalftoneCarrierTransform();
  const updated = updater(current);
  if (index >= 0) {
    next.carrierTransforms[index] = updated;
  } else {
    next.carrierTransforms.push(updated);
  }
  return next;
};

const upsertChannelDriftDamage = (
  state: CanvasImageRenderStateV1,
  updater: (
    node: Extract<SignalDamageNode, { type: "channel-drift" }>
  ) => Extract<SignalDamageNode, { type: "channel-drift" }>
) => {
  const next = cloneState(state);
  const index = next.signalDamage.findIndex((n) => n.type === "channel-drift");
  const current =
    index >= 0
      ? (next.signalDamage[index] as Extract<SignalDamageNode, { type: "channel-drift" }>)
      : createDefaultChannelDriftDamage();
  const updated = updater(current);
  if (index >= 0) {
    next.signalDamage[index] = updated;
  } else {
    next.signalDamage.push(updated);
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
      customCharset:
        partial.customCharset !== undefined
          ? partial.customCharset.length > 0
            ? partial.customCharset
            : null
          : transform.params.customCharset,
      invert: partial.invert ?? transform.params.invert,
      brightness: partial.brightness ?? transform.params.brightness,
      contrast: partial.contrast ?? transform.params.contrast,
      density: partial.density ?? transform.params.density,
      coverage: partial.coverage ?? transform.params.coverage,
      edgeEmphasis: partial.edgeEmphasis ?? transform.params.edgeEmphasis,
      renderMode: partial.renderMode ?? transform.params.renderMode,
      cellSize: partial.cellSize ?? transform.params.cellSize,
      characterSpacing: partial.characterSpacing ?? transform.params.characterSpacing,
      foregroundOpacity: partial.foregroundOpacity ?? transform.params.foregroundOpacity,
      foregroundBlendMode:
        partial.foregroundBlendMode ?? transform.params.foregroundBlendMode,
      gridOverlay: partial.gridOverlay ?? transform.params.gridOverlay,
      backgroundMode: partial.backgroundMode ?? transform.params.backgroundMode,
      backgroundColor: partial.backgroundColor ?? transform.params.backgroundColor,
      backgroundBlur: partial.backgroundBlur ?? transform.params.backgroundBlur,
      backgroundOpacity: partial.backgroundOpacity ?? transform.params.backgroundOpacity,
      colorMode: partial.colorMode ?? transform.params.colorMode,
      dither: partial.dither ?? transform.params.dither,
    },
  }));

export const applyHalftoneAdjustmentsToRenderState = (
  state: CanvasImageRenderStateV1,
  partial: Partial<HalftoneAdjustments>
) =>
  upsertHalftoneCarrierTransform(state, (transform) => ({
    ...transform,
    enabled: partial.enabled ?? transform.enabled,
    params: {
      ...transform.params,
      frequency: partial.frequency ?? transform.params.frequency,
      angle: partial.angle ?? transform.params.angle,
      shape: partial.shape ?? transform.params.shape,
      colorMode: partial.colorMode ?? transform.params.colorMode,
      dotScale: partial.dotScale ?? transform.params.dotScale,
      contrast: partial.contrast ?? transform.params.contrast,
      invert: partial.invert ?? transform.params.invert,
      backgroundColor: partial.backgroundColor ?? transform.params.backgroundColor,
      backgroundOpacity: partial.backgroundOpacity ?? transform.params.backgroundOpacity,
    },
  }));

export const applyChannelDriftAdjustmentsToRenderState = (
  state: CanvasImageRenderStateV1,
  partial: Partial<ChannelDriftAdjustments>
) =>
  upsertChannelDriftDamage(state, (node) => ({
    ...node,
    enabled: partial.enabled ?? node.enabled,
    params: {
      ...node.params,
      redOffsetX: partial.redOffsetX ?? node.params.redOffsetX,
      redOffsetY: partial.redOffsetY ?? node.params.redOffsetY,
      greenOffsetX: partial.greenOffsetX ?? node.params.greenOffsetX,
      greenOffsetY: partial.greenOffsetY ?? node.params.greenOffsetY,
      blueOffsetX: partial.blueOffsetX ?? node.params.blueOffsetX,
      blueOffsetY: partial.blueOffsetY ?? node.params.blueOffsetY,
      intensity: partial.intensity ?? node.params.intensity,
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
