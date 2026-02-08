export type PresetTag = "portrait" | "landscape" | "night" | "bw";

export type PresetAdjustmentKey =
  | "exposure"
  | "contrast"
  | "highlights"
  | "shadows"
  | "whites"
  | "blacks"
  | "temperature"
  | "tint"
  | "vibrance"
  | "saturation"
  | "clarity"
  | "dehaze"
  | "vignette"
  | "grain";

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

export type FilmModuleId =
  | "colorScience"
  | "tone"
  | "grain"
  | "defects"
  | "scan";

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

export type ColorScienceModule = FilmModuleBase<
  "colorScience",
  ColorScienceParams
>;
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

export interface FilmProfile {
  id: string;
  version: 1;
  name: string;
  description?: string;
  tags?: string[];
  modules: FilmModuleConfig[];
}

export interface FilmModuleOverride {
  enabled?: boolean;
  amount?: number;
  params?: Record<string, unknown>;
}

export type FilmProfileOverrides = Partial<Record<FilmModuleId, FilmModuleOverride>>;

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

export interface EditingAdjustments {
  exposure: number;
  contrast: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  temperature: number;
  tint: number;
  vibrance: number;
  saturation: number;
  texture: number;
  clarity: number;
  dehaze: number;
  curveHighlights: number;
  curveLights: number;
  curveDarks: number;
  curveShadows: number;
  hsl: HslAdjustments;
  sharpening: number;
  masking: number;
  noiseReduction: number;
  colorNoiseReduction: number;
  vignette: number;
  grain: number;
  grainSize: number;
  grainRoughness: number;
  rotate: number;
  vertical: number;
  horizontal: number;
  scale: number;
  flipHorizontal: boolean;
  flipVertical: boolean;
  aspectRatio: "original" | "1:1" | "3:2" | "4:3" | "4:5" | "16:9";
  opticsProfile: boolean;
  opticsCA: boolean;
}

export interface Asset {
  id: string;
  name: string;
  type: string;
  size: number;
  createdAt: string;
  objectUrl: string;
  thumbnailUrl?: string;
  presetId?: string;
  intensity?: number;
  filmProfileId?: string;
  filmOverrides?: FilmProfileOverrides;
  filmProfile?: FilmProfile;
  group?: string;
  blob?: Blob;
  thumbnailBlob?: Blob;
  metadata?: AssetMetadata;
  adjustments?: EditingAdjustments;
}

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
