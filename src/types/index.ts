export type PresetTag = "portrait" | "landscape" | "night" | "bw";

/**
 * Single source of truth for preset-adjustable numeric keys.
 * `PresetAdjustmentKey` is derived from this array.
 */
export const PRESET_ADJUSTMENT_KEYS = [
  "exposure",
  "contrast",
  "highlights",
  "shadows",
  "whites",
  "blacks",
  "curveHighlights",
  "curveLights",
  "curveDarks",
  "curveShadows",
  "temperature",
  "tint",
  "vibrance",
  "saturation",
  "clarity",
  "dehaze",
  "vignette",
  "grain",
  "grainSize",
  "grainRoughness",
  "sharpening",
  "sharpenRadius",
  "sharpenDetail",
  "masking",
  "noiseReduction",
  "colorNoiseReduction",
] as const;

export type PresetAdjustmentKey = (typeof PRESET_ADJUSTMENT_KEYS)[number];

export type PresetAdjustments = Partial<Record<PresetAdjustmentKey, number>>;

export interface Preset {
  id: string;
  name: string;
  tags: PresetTag[];
  intensity: number;
  description: string;
  adjustments: PresetAdjustments;
  filmProfileId?: string;
  filmProfile?: FilmProfile;
}

export type FilmModuleId = "colorScience" | "tone" | "grain" | "defects" | "scan";

export type FilmSeedMode = "perAsset" | "perRender" | "perExport" | "locked";

export interface ColorScienceParams {
  lutStrength: number;
  rgbMix: [number, number, number];
  temperatureShift: number;
  tintShift: number;
}

export interface ToneParams {
  exposure: number;
  contrast: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  curveHighlights: number;
  curveLights: number;
  curveDarks: number;
  curveShadows: number;
}

export interface GrainParams {
  amount: number;
  size: number;
  roughness: number;
  color: number;
  shadowBoost: number;
}

export interface DefectsParams {
  leakProbability: number;
  leakStrength: number;
  dustAmount: number;
  scratchAmount: number;
}

export interface ScanParams {
  halationThreshold: number;
  halationAmount: number;
  bloomThreshold: number;
  bloomAmount: number;
  vignetteAmount: number;
  scanWarmth: number;
}

export interface FilmModuleBase<TId extends FilmModuleId, TParams> {
  id: TId;
  enabled: boolean;
  amount: number;
  seedMode?: FilmSeedMode;
  seed?: number;
  params: TParams;
}

export type ColorScienceModule = FilmModuleBase<"colorScience", ColorScienceParams>;
export type ToneModule = FilmModuleBase<"tone", ToneParams>;
export type GrainModule = FilmModuleBase<"grain", GrainParams>;
export type DefectsModule = FilmModuleBase<"defects", DefectsParams>;
export type ScanModule = FilmModuleBase<"scan", ScanParams>;

export type FilmModuleConfig =
  | ColorScienceModule
  | ToneModule
  | GrainModule
  | DefectsModule
  | ScanModule;

export type FilmNumericParamKeyMap = {
  colorScience: Exclude<keyof ColorScienceParams, "rgbMix">;
  tone: keyof ToneParams;
  grain: keyof GrainParams;
  defects: keyof DefectsParams;
  scan: keyof ScanParams;
};

export type FilmNumericParamKey<TId extends FilmModuleId = FilmModuleId> =
  FilmNumericParamKeyMap[TId];

export interface FilmProfile {
  id: string;
  version: 1;
  name: string;
  description?: string;
  tags?: string[];
  modules: FilmModuleConfig[];
}

/** Maps each module id to its typed params for type-safe overrides. */
export type FilmModuleParamsMap = {
  colorScience: ColorScienceParams;
  tone: ToneParams;
  grain: GrainParams;
  defects: DefectsParams;
  scan: ScanParams;
};

export type FilmModuleOverride<TId extends FilmModuleId = FilmModuleId> = {
  enabled?: boolean;
  amount?: number;
  params?: Partial<FilmModuleParamsMap[TId]>;
};

export type FilmProfileOverrides = {
  [K in FilmModuleId]?: FilmModuleOverride<K>;
};

export interface AiPresetRecommendation {
  presetId: string;
  reason: string;
  confidence: number;
}

export interface AssetAiRecommendation {
  version: 1;
  model: string;
  matchedAt: string;
  attempts: number;
  topPresets: AiPresetRecommendation[];
  autoAppliedPresetId?: string;
  status: "succeeded" | "failed";
}

export type HslColorKey =
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "aqua"
  | "blue"
  | "purple"
  | "magenta";

export interface HslChannel {
  hue: number;
  saturation: number;
  luminance: number;
}

export type HslAdjustments = Record<HslColorKey, HslChannel>;

export interface PointCurvePoint {
  x: number;
  y: number;
}

export interface PointCurveAdjustments {
  rgb: PointCurvePoint[];
  red: PointCurvePoint[];
  green: PointCurvePoint[];
  blue: PointCurvePoint[];
}

export interface ColorGradingZone {
  hue: number;
  saturation: number;
  luminance: number;
}

export interface ColorGradingAdjustments {
  shadows: ColorGradingZone;
  midtones: ColorGradingZone;
  highlights: ColorGradingZone;
  blend: number;
  balance: number;
}

export interface BwMixAdjustments {
  red: number;
  green: number;
  blue: number;
}

export interface CalibrationAdjustments {
  redHue: number;
  redSaturation: number;
  greenHue: number;
  greenSaturation: number;
  blueHue: number;
  blueSaturation: number;
}

export interface LocalAdjustmentDelta {
  exposure?: number;
  contrast?: number;
  highlights?: number;
  shadows?: number;
  whites?: number;
  blacks?: number;
  temperature?: number;
  tint?: number;
  vibrance?: number;
  saturation?: number;
  texture?: number;
  clarity?: number;
  dehaze?: number;
  sharpening?: number;
  noiseReduction?: number;
  colorNoiseReduction?: number;
}

export interface LocalRadialMask {
  mode: "radial";
  centerX: number; // normalized [0, 1]
  centerY: number; // normalized [0, 1]
  radiusX: number; // normalized [0, 1]
  radiusY: number; // normalized [0, 1]
  feather: number; // [0, 1]
  lumaMin?: number; // normalized [0, 1]
  lumaMax?: number; // normalized [0, 1]
  lumaFeather?: number; // normalized [0, 1]
  hueCenter?: number; // degrees [0, 360)
  hueRange?: number; // degrees [0, 180]
  hueFeather?: number; // degrees [0, 180]
  satMin?: number; // normalized [0, 1]
  satFeather?: number; // normalized [0, 1]
  invert?: boolean;
}

export interface LocalLinearMask {
  mode: "linear";
  startX: number; // normalized [0, 1]
  startY: number; // normalized [0, 1]
  endX: number; // normalized [0, 1]
  endY: number; // normalized [0, 1]
  feather: number; // [0, 1]
  lumaMin?: number; // normalized [0, 1]
  lumaMax?: number; // normalized [0, 1]
  lumaFeather?: number; // normalized [0, 1]
  hueCenter?: number; // degrees [0, 360)
  hueRange?: number; // degrees [0, 180]
  hueFeather?: number; // degrees [0, 180]
  satMin?: number; // normalized [0, 1]
  satFeather?: number; // normalized [0, 1]
  invert?: boolean;
}

export interface LocalBrushPoint {
  x: number; // normalized [0, 1]
  y: number; // normalized [0, 1]
  pressure?: number; // normalized (0, 1]
}

export interface LocalBrushMask {
  mode: "brush";
  pointsBlobId?: string; // optional IndexedDB blob reference for large masks
  points: LocalBrushPoint[];
  brushSize: number; // normalized [0.005, 0.25]
  feather: number; // [0, 1]
  flow: number; // [0, 1]
  lumaMin?: number; // normalized [0, 1]
  lumaMax?: number; // normalized [0, 1]
  lumaFeather?: number; // normalized [0, 1]
  hueCenter?: number; // degrees [0, 360)
  hueRange?: number; // degrees [0, 180]
  hueFeather?: number; // degrees [0, 180]
  satMin?: number; // normalized [0, 1]
  satFeather?: number; // normalized [0, 1]
  invert?: boolean;
}

export type LocalAdjustmentMask = LocalRadialMask | LocalLinearMask | LocalBrushMask;

export interface LocalAdjustment {
  id: string;
  enabled: boolean;
  amount: number; // [0, 100]
  mask: LocalAdjustmentMask;
  adjustments: LocalAdjustmentDelta;
}

/**
 * Single source of truth for valid aspect ratio values.
 * `AspectRatio` type is derived from this array.
 */
export const ASPECT_RATIOS = [
  "free",
  "original",
  "1:1",
  "2:1",
  "1:2",
  "4:3",
  "3:4",
  "7:5",
  "5:7",
  "11:8.5",
  "8.5:11",
  "16:10",
  "10:16",
  "4:5",
  "5:4",
  "3:2",
  "2:3",
  "16:9",
  "9:16",
] as const;

export type AspectRatio = (typeof ASPECT_RATIOS)[number];

export interface EditingAdjustments {
  exposure: number;
  contrast: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  temperature: number;
  tint: number;
  temperatureKelvin?: number;
  tintMG?: number;
  vibrance: number;
  saturation: number;
  texture: number;
  clarity: number;
  dehaze: number;
  curveHighlights: number;
  curveLights: number;
  curveDarks: number;
  curveShadows: number;
  pointCurve: PointCurveAdjustments;
  hsl: HslAdjustments;
  bwEnabled?: boolean;
  bwMix?: BwMixAdjustments;
  calibration?: CalibrationAdjustments;
  localAdjustments?: LocalAdjustment[];
  colorGrading: ColorGradingAdjustments;
  sharpening: number;
  sharpenRadius: number;
  sharpenDetail: number;
  masking: number;
  noiseReduction: number;
  colorNoiseReduction: number;
  vignette: number;
  grain: number;
  grainSize: number;
  grainRoughness: number;
  rotate: number;
  rightAngleRotation: number;
  perspectiveEnabled?: boolean;
  perspectiveHorizontal?: number;
  perspectiveVertical?: number;
  vertical: number;
  horizontal: number;
  scale: number;
  flipHorizontal: boolean;
  flipVertical: boolean;
  aspectRatio: AspectRatio;
  customAspectRatio: number;
  timestampEnabled: boolean;
  timestampPosition: "bottom-right" | "bottom-left" | "top-right" | "top-left";
  timestampSize: number;
  timestampOpacity: number;
  opticsProfile: boolean;
  opticsCA: boolean;
  opticsVignette: number;
}

/** MIME types accepted for asset import. */
export type AssetMimeType =
  | "image/jpeg"
  | "image/png"
  | "image/tiff"
  | "image/webp"
  | "image/avif";

export interface Asset {
  id: string;
  name: string;
  type: AssetMimeType | (string & {});
  size: number;
  createdAt: string;
  objectUrl: string;
  thumbnailUrl?: string;
  /** Local day key used by workspace timeline grouping, e.g. "2026-02-26". */
  importDay?: string;
  /** User-defined labels for filtering and batch management. */
  tags?: string[];
  presetId?: string;
  intensity?: number;
  filmProfileId?: string;
  filmOverrides?: FilmProfileOverrides;
  filmProfile?: FilmProfile;
  /** @deprecated Legacy field kept for backward-compat reads only. */
  group?: string;
  blob?: Blob;
  thumbnailBlob?: Blob;
  metadata?: AssetMetadata;
  adjustments?: EditingAdjustments;
  aiRecommendation?: AssetAiRecommendation;
  source?: "imported" | "ai-generated";
}

/** Fields that consumers may update on an existing asset. */
export type AssetUpdate = Partial<
  Pick<
    Asset,
    | "presetId"
    | "intensity"
    | "filmProfileId"
    | "filmProfile"
    | "filmOverrides"
    | "group"
    | "importDay"
    | "tags"
    | "metadata"
    | "adjustments"
    | "aiRecommendation"
    | "source"
    | "thumbnailUrl"
    | "thumbnailBlob"
  >
>;

/** An asset that is guaranteed to have its image blob loaded. */
export type RenderableAsset = Asset & { blob: Blob };

export interface AssetMetadata {
  width?: number;
  height?: number;
  cameraMake?: string;
  cameraModel?: string;
  lensModel?: string;
  focalLength?: number;
  aperture?: number;
  shutterSpeed?: string;
  iso?: number;
  capturedAt?: string;
}

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export * from "./canvas";
export * from "./chat";

