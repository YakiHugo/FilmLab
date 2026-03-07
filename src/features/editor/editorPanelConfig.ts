import type { NumericAdjustmentKey } from "./types";

export type SectionId =
  | "basic"
  | "effects"
  | "detail"
  | "timestamp"
  | "advanced"
  | "film"
  | "hsl"
  | "grading"
  | "curve"
  | "optics"
  | "crop"
  | "mask"
  | "remove"
  | "local"
  | "export";

export type CurveChannel = "rgb" | "red" | "green" | "blue";

export type EditorToolPanelId =
  | "preset"
  | "edit"
  | "crop"
  | "mask"
  | "remove"
  | "export";

export interface SliderDefinition {
  key: NumericAdjustmentKey;
  label: string;
  min: number;
  max: number;
  step?: number;
  format?: (value: number) => string;
}

interface WhiteBalancePreset {
  id: string;
  label: string;
  temperature: number;
  tint: number;
}

const formatSigned = (value: number) => (value > 0 ? `+${value}` : `${value}`);

export const DEFAULT_OPEN_SECTIONS: Record<SectionId, boolean> = {
  basic: true,
  effects: true,
  detail: true,
  timestamp: true,
  advanced: false,
  film: false,
  hsl: false,
  grading: false,
  curve: false,
  optics: false,
  crop: true,
  mask: true,
  remove: true,
  local: false,
  export: true,
};

export const DEFAULT_EDITOR_TOOL_PANEL_ID: EditorToolPanelId = "edit";

export const BASIC_LIGHT_SLIDERS: SliderDefinition[] = [
  { key: "exposure", label: "Exposure", min: -100, max: 100, format: formatSigned },
  { key: "contrast", label: "Contrast", min: -100, max: 100, format: formatSigned },
  { key: "highlights", label: "Highlights", min: -100, max: 100, format: formatSigned },
  { key: "shadows", label: "Shadows", min: -100, max: 100, format: formatSigned },
  { key: "whites", label: "Whites", min: -100, max: 100, format: formatSigned },
  { key: "blacks", label: "Blacks", min: -100, max: 100, format: formatSigned },
];

export const BASIC_COLOR_SLIDERS: SliderDefinition[] = [
  { key: "temperature", label: "Temperature", min: -100, max: 100, format: formatSigned },
  { key: "tint", label: "Tint", min: -100, max: 100, format: formatSigned },
  { key: "saturation", label: "Saturation", min: -100, max: 100, format: formatSigned },
  { key: "vibrance", label: "Vibrance", min: -100, max: 100, format: formatSigned },
];

export const WHITE_BALANCE_PRESETS: WhiteBalancePreset[] = [
  { id: "asShot", label: "As Shot", temperature: 0, tint: 0 },
  { id: "auto", label: "Auto", temperature: 6, tint: 2 },
  { id: "daylight", label: "Daylight", temperature: 18, tint: 4 },
  { id: "cloudy", label: "Cloudy", temperature: 30, tint: 6 },
  { id: "shade", label: "Shade", temperature: 42, tint: 8 },
  { id: "tungsten", label: "Tungsten", temperature: -38, tint: 5 },
  { id: "fluorescent", label: "Fluorescent", temperature: -20, tint: 12 },
];


export const EFFECTS_SLIDERS: SliderDefinition[] = [
  { key: "clarity", label: "Clarity", min: -100, max: 100, format: formatSigned },
  { key: "texture", label: "Texture", min: -100, max: 100, format: formatSigned },
  { key: "dehaze", label: "Dehaze", min: -100, max: 100, format: formatSigned },
  { key: "vignette", label: "Vignette", min: -100, max: 100, format: formatSigned },
  { key: "grain", label: "Grain", min: 0, max: 100 },
  { key: "grainSize", label: "Grain Size", min: 0, max: 100 },
  { key: "grainRoughness", label: "Grain Roughness", min: 0, max: 100 },
];

export const GLOW_SLIDERS: SliderDefinition[] = [
  { key: "glowIntensity", label: "Glow Intensity", min: 0, max: 100 },
  { key: "glowMidtoneFocus", label: "Glow Midtone Focus", min: 0, max: 100 },
  { key: "glowBias", label: "Glow Bias", min: 0, max: 100 },
  { key: "glowRadius", label: "Glow Radius", min: 0, max: 100 },
];

export const DETAIL_SLIDERS: SliderDefinition[] = [
  { key: "sharpening", label: "Sharpening", min: 0, max: 100 },
  { key: "sharpenRadius", label: "Sharpen Radius", min: 0, max: 100 },
  { key: "sharpenDetail", label: "Sharpen Detail", min: 0, max: 100 },
  { key: "masking", label: "Masking", min: 0, max: 100 },
  { key: "noiseReduction", label: "Noise Reduction", min: 0, max: 100 },
  { key: "colorNoiseReduction", label: "Color Noise Reduction", min: 0, max: 100 },
];

export const CROP_SLIDERS: SliderDefinition[] = [
  {
    key: "rotate",
    label: "Rotate",
    min: -45,
    max: 45,
    step: 0.01,
    format: (value) => value.toFixed(2),
  },
];
