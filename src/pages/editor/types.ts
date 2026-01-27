export type ToolGroupId = "filter" | "adjust" | "color" | "effects" | "detail" | "crop";

export type NumericAdjustmentKey =
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
  | "grain"
  | "sharpening"
  | "noiseReduction"
  | "colorNoiseReduction"
  | "rotate"
  | "horizontal"
  | "vertical"
  | "scale";

export interface ToolDefinition {
  id: NumericAdjustmentKey;
  label: string;
  min: number;
  max: number;
  step?: number;
  format?: (value: number) => string;
}
