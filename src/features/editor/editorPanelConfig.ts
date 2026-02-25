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

export type EditorToolPanelId = "preset" | "edit" | "crop" | "mask" | "remove" | "ai";

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
    label: "预设",
    description: "浏览预设与 AI 推荐",
  },
  {
    id: "edit",
    label: "编辑",
    description: "光影、色彩、效果、细节与高级调整",
  },
  {
    id: "crop",
    label: "裁剪",
    description: "比例、拉直、旋转与构图",
  },
  {
    id: "mask",
    label: "蒙版",
    description: "局部调整蒙版",
  },
  {
    id: "remove",
    label: "移除",
    description: "修复/移除工具（即将推出）",
    disabled: true,
  },
  {
    id: "ai",
    label: "AI",
    description: "AI 智能编辑助手",
  },
];

export const EDITOR_PANEL_SECTION_MAP: Record<EditorToolPanelId, EditorPanelSectionId[]> = {
  preset: ["preset"],
  edit: ["basic", "effects", "detail", "timestamp", "advanced"],
  crop: ["crop"],
  mask: ["mask"],
  remove: ["remove"],
  ai: ["ai"],
};

export const HSL_COLORS: Array<{ id: HslColorKey; label: string; swatch: string }> = [
  { id: "red", label: "红", swatch: "bg-red-400" },
  { id: "orange", label: "橙", swatch: "bg-orange-400" },
  { id: "yellow", label: "黄", swatch: "bg-yellow-300" },
  { id: "green", label: "绿", swatch: "bg-emerald-400" },
  { id: "aqua", label: "青", swatch: "bg-cyan-400" },
  { id: "blue", label: "蓝", swatch: "bg-blue-400" },
  { id: "purple", label: "紫", swatch: "bg-purple-400" },
  { id: "magenta", label: "品红", swatch: "bg-pink-400" },
];

export const CURVE_CHANNELS: Array<{ id: CurveChannel; label: string; enabled: boolean }> = [
  { id: "rgb", label: "RGB", enabled: true },
  { id: "red", label: "R", enabled: false },
  { id: "green", label: "G", enabled: false },
  { id: "blue", label: "B", enabled: false },
];

export const BASIC_LIGHT_SLIDERS: SliderDefinition[] = [
  { key: "exposure", label: "曝光", min: -100, max: 100, format: formatSigned },
  { key: "contrast", label: "对比度", min: -100, max: 100, format: formatSigned },
  { key: "highlights", label: "高光", min: -100, max: 100, format: formatSigned },
  { key: "shadows", label: "阴影", min: -100, max: 100, format: formatSigned },
  { key: "whites", label: "白色", min: -100, max: 100, format: formatSigned },
  { key: "blacks", label: "黑色", min: -100, max: 100, format: formatSigned },
];

export const BASIC_COLOR_SLIDERS: SliderDefinition[] = [
  { key: "temperature", label: "色温", min: -100, max: 100, format: formatSigned },
  { key: "tint", label: "色调", min: -100, max: 100, format: formatSigned },
  { key: "saturation", label: "饱和度", min: -100, max: 100, format: formatSigned },
  { key: "vibrance", label: "自然饱和度", min: -100, max: 100, format: formatSigned },
];

export const WHITE_BALANCE_PRESETS: WhiteBalancePreset[] = [
  { id: "asShot", label: "原始", temperature: 0, tint: 0 },
  { id: "auto", label: "自动", temperature: 6, tint: 2 },
  { id: "daylight", label: "日光", temperature: 18, tint: 4 },
  { id: "cloudy", label: "阴天", temperature: 30, tint: 6 },
  { id: "shade", label: "阴影", temperature: 42, tint: 8 },
  { id: "tungsten", label: "钨丝灯", temperature: -38, tint: 5 },
  { id: "fluorescent", label: "荧光灯", temperature: -20, tint: 12 },
];

export const CURVE_SLIDERS: SliderDefinition[] = [
  { key: "curveHighlights", label: "高光", min: -100, max: 100, format: formatSigned },
  { key: "curveLights", label: "亮部", min: -100, max: 100, format: formatSigned },
  { key: "curveDarks", label: "暗部", min: -100, max: 100, format: formatSigned },
  { key: "curveShadows", label: "阴影", min: -100, max: 100, format: formatSigned },
];

export const EFFECTS_SLIDERS: SliderDefinition[] = [
  { key: "clarity", label: "清晰度", min: -100, max: 100, format: formatSigned },
  { key: "texture", label: "纹理", min: -100, max: 100, format: formatSigned },
  { key: "dehaze", label: "去雾", min: -100, max: 100, format: formatSigned },
  { key: "vignette", label: "暗角", min: -100, max: 100, format: formatSigned },
  { key: "grain", label: "颗粒", min: 0, max: 100 },
  { key: "grainSize", label: "颗粒大小", min: 0, max: 100 },
  { key: "grainRoughness", label: "颗粒粗糙度", min: 0, max: 100 },
];

export const DETAIL_SLIDERS: SliderDefinition[] = [
  { key: "sharpening", label: "锐化", min: 0, max: 100 },
  { key: "sharpenRadius", label: "半径", min: 0, max: 100 },
  { key: "sharpenDetail", label: "细节", min: 0, max: 100 },
  { key: "masking", label: "蒙版", min: 0, max: 100 },
  { key: "noiseReduction", label: "亮度降噪", min: 0, max: 100 },
  { key: "colorNoiseReduction", label: "色彩降噪", min: 0, max: 100 },
];

export const CROP_SLIDERS: SliderDefinition[] = [
  {
    key: "rotate",
    label: "拉直",
    min: -45,
    max: 45,
    step: 0.01,
    format: (value) => value.toFixed(2),
  },
];

export const AI_FEATURES = ["自动曝光 / 白平衡", "主体感知调整", "天空增强", "肤色保护"];
