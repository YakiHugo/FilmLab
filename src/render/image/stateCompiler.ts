import type { Asset } from "@/types";
import type {
  CanvasImageRenderStateV1,
  ImageEffectNode,
  ImageFilter2dEffectNode,
  ImageRenderSource,
} from "./types";

const DEFAULT_POINT_CURVE = {
  rgb: [
    { x: 0, y: 0 },
    { x: 255, y: 255 },
  ],
  red: [
    { x: 0, y: 0 },
    { x: 255, y: 255 },
  ],
  green: [
    { x: 0, y: 0 },
    { x: 255, y: 255 },
  ],
  blue: [
    { x: 0, y: 0 },
    { x: 255, y: 255 },
  ],
} satisfies CanvasImageRenderStateV1["develop"]["color"]["pointCurve"];

const DEFAULT_HSL_CHANNEL = {
  hue: 0,
  saturation: 0,
  luminance: 0,
};

const DEFAULT_HSL = {
  red: { ...DEFAULT_HSL_CHANNEL },
  orange: { ...DEFAULT_HSL_CHANNEL },
  yellow: { ...DEFAULT_HSL_CHANNEL },
  green: { ...DEFAULT_HSL_CHANNEL },
  aqua: { ...DEFAULT_HSL_CHANNEL },
  blue: { ...DEFAULT_HSL_CHANNEL },
  purple: { ...DEFAULT_HSL_CHANNEL },
  magenta: { ...DEFAULT_HSL_CHANNEL },
} satisfies CanvasImageRenderStateV1["develop"]["color"]["hsl"];

const DEFAULT_BW_MIX = {
  red: 0,
  green: 0,
  blue: 0,
} satisfies CanvasImageRenderStateV1["develop"]["color"]["bwMix"];

const DEFAULT_CALIBRATION = {
  redHue: 0,
  redSaturation: 0,
  greenHue: 0,
  greenSaturation: 0,
  blueHue: 0,
  blueSaturation: 0,
} satisfies CanvasImageRenderStateV1["develop"]["color"]["calibration"];

const DEFAULT_COLOR_GRADING_ZONE = {
  hue: 0,
  saturation: 0,
  luminance: 0,
};

const DEFAULT_COLOR_GRADING = {
  shadows: { ...DEFAULT_COLOR_GRADING_ZONE },
  midtones: { ...DEFAULT_COLOR_GRADING_ZONE },
  highlights: { ...DEFAULT_COLOR_GRADING_ZONE },
  blend: 50,
  balance: 0,
} satisfies CanvasImageRenderStateV1["develop"]["color"]["colorGrading"];

const DEFAULT_CUSTOM_LUT = {
  enabled: false,
  path: "",
  size: 8,
  intensity: 0,
} satisfies NonNullable<CanvasImageRenderStateV1["develop"]["fx"]["customLut"]>;

const cloneRenderStateValue = <T>(value: T): T => {
  if (typeof structuredClone === "function") {
    return structuredClone(value) as T;
  }
  return JSON.parse(JSON.stringify(value)) as T;
};

export const resolveImageRenderSource = (asset: Asset): ImageRenderSource => ({
  assetId: asset.id,
  objectUrl: asset.objectUrl,
  contentHash: asset.contentHash ?? null,
  name: asset.name,
  mimeType: asset.type,
  width: asset.metadata?.width,
  height: asset.metadata?.height,
});

export const createNeutralCanvasImageRenderState = (): CanvasImageRenderStateV1 => ({
  geometry: {
    rotate: 0,
    rightAngleRotation: 0,
    perspectiveEnabled: false,
    perspectiveHorizontal: 0,
    perspectiveVertical: 0,
    vertical: 0,
    horizontal: 0,
    scale: 100,
    flipHorizontal: false,
    flipVertical: false,
    aspectRatio: "original",
    customAspectRatio: 4 / 3,
    opticsProfile: false,
    opticsCA: false,
    opticsDistortionK1: 0,
    opticsDistortionK2: 0,
    opticsCaAmount: 0,
    opticsVignette: 0,
    opticsVignetteMidpoint: 50,
  },
  develop: {
    tone: {
      exposure: 0,
      contrast: 0,
      highlights: 0,
      shadows: 0,
      whites: 0,
      blacks: 0,
    },
    color: {
      temperature: 0,
      tint: 0,
      hue: 0,
      temperatureKelvin: undefined,
      tintMG: undefined,
      vibrance: 0,
      saturation: 0,
      pointCurve: cloneRenderStateValue(DEFAULT_POINT_CURVE),
      hsl: cloneRenderStateValue(DEFAULT_HSL),
      bwEnabled: false,
      bwMix: cloneRenderStateValue(DEFAULT_BW_MIX),
      calibration: cloneRenderStateValue(DEFAULT_CALIBRATION),
      colorGrading: cloneRenderStateValue(DEFAULT_COLOR_GRADING),
    },
    detail: {
      texture: 0,
      clarity: 0,
      dehaze: 0,
      sharpening: 0,
      sharpenRadius: 40,
      sharpenDetail: 25,
      masking: 0,
      noiseReduction: 0,
      colorNoiseReduction: 0,
    },
    fx: {
      vignette: 0,
      grain: 0,
      grainSize: 50,
      grainRoughness: 50,
      glowIntensity: 0,
      glowMidtoneFocus: 50,
      glowBias: 25,
      glowRadius: 24,
      customLut: cloneRenderStateValue(DEFAULT_CUSTOM_LUT),
      pushPullEv: undefined,
    },
    regions: [],
  },
  masks: {
    byId: {},
  },
  effects: [],
  film: {
    profileId: null,
    profile: undefined,
    profileOverrides: null,
  },
  output: {
    timestamp: {
      enabled: false,
      position: "bottom-right",
      size: 22,
      opacity: 72,
    },
  },
});

export const createDefaultCanvasImageRenderState = (): CanvasImageRenderStateV1 =>
  createNeutralCanvasImageRenderState();

const resolveFilter2dFromEffects = (effects: readonly ImageEffectNode[]) => {
  const effect = effects.find(
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

export const resolveFilter2dPreviewValuesFromState = (state: CanvasImageRenderStateV1) =>
  resolveFilter2dFromEffects(state.effects);
