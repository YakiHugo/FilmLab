import type { EditingAdjustments } from "@/types";

export type ToolGroupId = "filter" | "adjust" | "color" | "effects" | "detail" | "crop";

type NumericKeyOf<T> = {
  [K in keyof T]-?: T[K] extends number ? K : never;
}[keyof T];

export type NumericAdjustmentKey = NumericKeyOf<EditingAdjustments>;

export interface ToolDefinition {
  id: NumericAdjustmentKey;
  label: string;
  min: number;
  max: number;
  step?: number;
  format?: (value: number) => string;
}
