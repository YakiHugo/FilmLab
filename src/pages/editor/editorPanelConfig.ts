import type { HslColorKey } from "@/types";
import type { NumericAdjustmentKey } from "./types";

export type SectionId =
  | "film"
  | "basic"
  | "hsl"
  | "curve"
  | "effects"
  | "detail"
  | "crop"
  | "local"
  | "ai"
  | "export";

export type CurveChannel = "rgb" | "red" | "green" | "blue";

export interface SliderDefinition {
  key: NumericAdjustmentKey;
  label: string;
  min: number;
  max: number;
  step?: number;
  format?: (value: number) => string;
}

const formatSigned = (value: number) => (value > 0 ? `+${value}` : `${value}`);

export const DEFAULT_OPEN_SECTIONS: Record<SectionId, boolean> = {
  film: true,
  basic: true,
  hsl: false,
  curve: false,
  effects: true,
  detail: false,
  crop: true,
  local: false,
  ai: false,
  export: false,
};

export const HSL_COLORS: Array<{ id: HslColorKey; label: string; swatch: string }> = [
  { id: "red", label: "红", swatch: "bg-red-400" },
  { id: "orange", label: "橙", swatch: "bg-orange-400" },
  { id: "yellow", label: "黄", swatch: "bg-yellow-300" },
  { id: "green", label: "绿", swatch: "bg-emerald-400" },
  { id: "aqua", label: "青", swatch: "bg-cyan-400" },
  { id: "blue", label: "蓝", swatch: "bg-blue-400" },
  { id: "purple", label: "紫", swatch: "bg-purple-400" },
  { id: "magenta", label: "洋红", swatch: "bg-pink-400" },
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
  { key: "whites", label: "白色色阶", min: -100, max: 100, format: formatSigned },
  { key: "blacks", label: "黑色色阶", min: -100, max: 100, format: formatSigned },
];

export const BASIC_COLOR_SLIDERS: SliderDefinition[] = [
  { key: "temperature", label: "色温", min: -100, max: 100, format: formatSigned },
  { key: "tint", label: "色调", min: -100, max: 100, format: formatSigned },
  { key: "saturation", label: "饱和度", min: -100, max: 100, format: formatSigned },
  { key: "vibrance", label: "自然饱和度", min: -100, max: 100, format: formatSigned },
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
  { key: "masking", label: "遮罩", min: 0, max: 100 },
  { key: "noiseReduction", label: "亮度降噪", min: 0, max: 100 },
  { key: "colorNoiseReduction", label: "色彩降噪", min: 0, max: 100 },
];

export const CROP_SLIDERS: SliderDefinition[] = [
  {
    key: "rotate",
    label: "旋转 / 拉直",
    min: -45,
    max: 45,
    format: (value) => `${formatSigned(value)}°`,
  },
  { key: "horizontal", label: "水平", min: -100, max: 100, format: formatSigned },
  { key: "vertical", label: "垂直", min: -100, max: 100, format: formatSigned },
  { key: "scale", label: "缩放", min: 80, max: 120, format: (value) => `${value}%` },
];

export const AI_FEATURES = [
  "自动曝光/自动白平衡",
  "智能抠主体",
  "智能天空增强",
  "人像肤色保护",
];
