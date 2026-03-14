export type ImageModelParamValue = string | number | boolean | null;

export interface ImageModelParamOption {
  label: string;
  value: string;
}

export interface ImageModelParamDefinition {
  key: string;
  label: string;
  type: "select" | "number" | "boolean";
  description?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: ImageModelParamOption[];
  defaultValue: ImageModelParamValue;
}
