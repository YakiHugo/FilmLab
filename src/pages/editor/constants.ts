import { presets } from "@/data/presets";
import { createDefaultAdjustments } from "@/lib/adjustments";
import type { EditingAdjustments } from "@/types";
import type { NumericAdjustmentKey, ToolDefinition, ToolGroupId } from "./types";

const formatSigned = (value: number) => (value > 0 ? `+${value}` : `${value}`);

export const PRESET_MAP = new Map(presets.map((preset) => [preset.id, preset.name]));

export const TOOL_GROUPS: { id: ToolGroupId; label: string }[] = [
  { id: "filter", label: "滤镜" },
  { id: "adjust", label: "基础" },
  { id: "color", label: "颜色" },
  { id: "effects", label: "效果" },
  { id: "detail", label: "细节" },
  { id: "crop", label: "裁切" },
];

export const TOOL_DEFINITIONS: Record<Exclude<ToolGroupId, "filter">, ToolDefinition[]> = {
  adjust: [
    { id: "exposure", label: "曝光", min: -100, max: 100, format: formatSigned },
    { id: "contrast", label: "对比度", min: -100, max: 100, format: formatSigned },
    { id: "highlights", label: "高光", min: -100, max: 100, format: formatSigned },
    { id: "shadows", label: "阴影", min: -100, max: 100, format: formatSigned },
    { id: "whites", label: "白色色阶", min: -100, max: 100, format: formatSigned },
    { id: "blacks", label: "黑色色阶", min: -100, max: 100, format: formatSigned },
  ],
  color: [
    { id: "temperature", label: "色温", min: -100, max: 100, format: formatSigned },
    { id: "tint", label: "色调", min: -100, max: 100, format: formatSigned },
    {
      id: "vibrance",
      label: "自然饱和度",
      min: -100,
      max: 100,
      format: formatSigned,
    },
    { id: "saturation", label: "饱和度", min: -100, max: 100, format: formatSigned },
  ],
  effects: [
    { id: "clarity", label: "清晰度", min: -100, max: 100, format: formatSigned },
    { id: "dehaze", label: "去朦胧", min: -100, max: 100, format: formatSigned },
    { id: "vignette", label: "暗角", min: -100, max: 100, format: formatSigned },
    { id: "grain", label: "颗粒", min: 0, max: 100 },
  ],
  detail: [
    { id: "sharpening", label: "锐化", min: 0, max: 100 },
    { id: "noiseReduction", label: "降噪", min: 0, max: 100 },
    { id: "colorNoiseReduction", label: "色彩降噪", min: 0, max: 100 },
  ],
  crop: [
    {
      id: "rotate",
      label: "旋转",
      min: -45,
      max: 45,
      format: (value) => `${formatSigned(value)}°`,
    },
    { id: "horizontal", label: "水平", min: -100, max: 100, format: formatSigned },
    { id: "vertical", label: "垂直", min: -100, max: 100, format: formatSigned },
    { id: "scale", label: "缩放", min: 80, max: 120, format: (value) => `${value}%` },
  ],
};

export const DEFAULT_TOOL_BY_GROUP: Record<Exclude<ToolGroupId, "filter">, NumericAdjustmentKey> = {
  adjust: "exposure",
  color: "temperature",
  effects: "vignette",
  detail: "sharpening",
  crop: "rotate",
};

export const ASPECT_RATIOS: {
  value: EditingAdjustments["aspectRatio"];
  label: string;
  ratio: string;
}[] = [
  { value: "free", label: "自由", ratio: "auto" },
  { value: "original", label: "原始", ratio: "auto" },
  { value: "1:1", label: "1:1", ratio: "1 / 1" },
  { value: "4:5", label: "4:5", ratio: "4 / 5" },
  { value: "5:4", label: "5:4", ratio: "5 / 4" },
  { value: "3:2", label: "3:2", ratio: "3 / 2" },
  { value: "16:9", label: "16:9", ratio: "16 / 9" },
  { value: "9:16", label: "9:16", ratio: "9 / 16" },
];

export const DEFAULT_ADJUSTMENTS = createDefaultAdjustments();
