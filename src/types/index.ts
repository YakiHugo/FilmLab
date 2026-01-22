export type PresetTag = "人像" | "风景" | "夜景" | "黑白";

export interface Preset {
  id: string;
  name: string;
  tags: PresetTag[];
  intensity: number;
  description: string;
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
  aspectRatio: "original" | "1:1" | "3:2" | "4:3" | "16:9";
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
  presetId?: string;
  intensity?: number;
  group?: string;
  blob?: Blob;
  adjustments?: EditingAdjustments;
}

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}
