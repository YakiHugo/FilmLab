import type { HslColorKey } from "@/types";
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
  | "ai"
  | "local"
  | "export";

export type CurveChannel = "rgb" | "red" | "green" | "blue";

export type EditorToolPanelId =
  | "preset"
  | "edit"
  | "crop"
  | "mask"
  | "remove"
  | "ai";

export type EditorPanelSectionId = SectionId | "preset";

export interface EditorToolPanelDefinition {
  id: EditorToolPanelId;
  label: string;
  description: string;
  disabled?: boolean;
}

export interface SliderDefinition {
  key: NumericAdjustmentKey;
  label: string;
  min: number;
  max: number;
  step?: number;
  format?: (value: number) => string;
}

export interface WhiteBalancePreset {
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
  ai: true,
  local: false,
  export: false,
};

export const DEFAULT_EDITOR_TOOL_PANEL_ID: EditorToolPanelId = "edit";

export const EDITOR_TOOL_PANELS: EditorToolPanelDefinition[] = [
  {
    id: "preset",
    label: "Presets",
    description: "Browse presets and AI recommendations",
  },
  {
    id: "edit",
    label: "Edit",
    description: "Light, color, effects, detail and advanced controls",
  },
  {
    id: "crop",
    label: "裁剪",
    description: "比例、拉直、旋转与构图",
  },
  {
    id: "mask",
    label: "Mask",
    description: "Local adjustment placeholder",
    disabled: true,
  },
  {
    id: "remove",
    label: "Remove",
    description: "Healing/removal placeholder",
    disabled: true,
  },
  {
    id: "ai",
    label: "AI",
    description: "AI Agent placeholder panel",
  },
];

export const EDITOR_PANEL_SECTION_MAP: Record<
  EditorToolPanelId,
  EditorPanelSectionId[]
> = {
  preset: ["preset"],
  edit: ["basic", "effects", "detail", "timestamp", "advanced"],
  crop: ["crop"],
  mask: ["mask"],
  remove: ["remove"],
  ai: ["ai"],
};

export const HSL_COLORS: Array<{ id: HslColorKey; label: string; swatch: string }> = [
  { id: "red", label: "Red", swatch: "bg-red-400" },
  { id: "orange", label: "Orange", swatch: "bg-orange-400" },
  { id: "yellow", label: "Yellow", swatch: "bg-yellow-300" },
  { id: "green", label: "Green", swatch: "bg-emerald-400" },
  { id: "aqua", label: "Aqua", swatch: "bg-cyan-400" },
  { id: "blue", label: "Blue", swatch: "bg-blue-400" },
  { id: "purple", label: "Purple", swatch: "bg-purple-400" },
  { id: "magenta", label: "Magenta", swatch: "bg-pink-400" },
];

export const CURVE_CHANNELS: Array<{ id: CurveChannel; label: string; enabled: boolean }> = [
  { id: "rgb", label: "RGB", enabled: true },
  { id: "red", label: "R", enabled: false },
  { id: "green", label: "G", enabled: false },
  { id: "blue", label: "B", enabled: false },
];

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

export const CURVE_SLIDERS: SliderDefinition[] = [
  { key: "curveHighlights", label: "Highlights", min: -100, max: 100, format: formatSigned },
  { key: "curveLights", label: "Lights", min: -100, max: 100, format: formatSigned },
  { key: "curveDarks", label: "Darks", min: -100, max: 100, format: formatSigned },
  { key: "curveShadows", label: "Shadows", min: -100, max: 100, format: formatSigned },
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

export const DETAIL_SLIDERS: SliderDefinition[] = [
  { key: "sharpening", label: "Sharpening", min: 0, max: 100 },
  { key: "masking", label: "Masking", min: 0, max: 100 },
  { key: "noiseReduction", label: "Luma NR", min: 0, max: 100 },
  { key: "colorNoiseReduction", label: "Color NR", min: 0, max: 100 },
];

export const CROP_SLIDERS: SliderDefinition[] = [
  {
    key: "rotate",
    label: "拉直",
    min: -180,
    max: 180,
    step: 0.01,
    format: (value) => value.toFixed(2),
  },
];

export const AI_FEATURES = [
  "Auto exposure / white balance",
  "Subject aware adjustment",
  "Sky enhancement",
  "Skin tone protection",
];
