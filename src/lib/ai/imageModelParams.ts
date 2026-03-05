import type { ImageProviderId } from "@/types/imageGeneration";

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

interface ImageModelParamConfig {
  provider: ImageProviderId;
  model: string;
  fields: ImageModelParamDefinition[];
}

const OPENAI_GPT_IMAGE_FIELDS: ImageModelParamDefinition[] = [
  {
    key: "renderMood",
    label: "Render Mood",
    type: "select",
    options: [
      { label: "Neutral", value: "neutral" },
      { label: "Vivid", value: "vivid" },
      { label: "Muted", value: "muted" },
    ],
    defaultValue: "neutral",
  },
  {
    key: "detailLevel",
    label: "Detail Level",
    type: "number",
    min: 1,
    max: 10,
    step: 1,
    defaultValue: 6,
  },
];

const OPENAI_DALLE_FIELDS: ImageModelParamDefinition[] = [
  {
    key: "quality",
    label: "Quality",
    type: "select",
    options: [
      { label: "Standard", value: "standard" },
      { label: "HD", value: "hd" },
    ],
    defaultValue: "standard",
  },
  {
    key: "styleTone",
    label: "Style Tone",
    type: "select",
    options: [
      { label: "Natural", value: "natural" },
      { label: "Vivid", value: "vivid" },
    ],
    defaultValue: "natural",
  },
];

const STABILITY_COMMON_FIELDS: ImageModelParamDefinition[] = [
  {
    key: "outputFormat",
    label: "Output",
    type: "select",
    options: [
      { label: "PNG", value: "png" },
      { label: "JPEG", value: "jpeg" },
      { label: "WebP", value: "webp" },
    ],
    defaultValue: "png",
  },
  {
    key: "stylePreset",
    label: "Style Preset",
    type: "select",
    options: [
      { label: "Auto", value: "auto" },
      { label: "Photographic", value: "photographic" },
      { label: "Cinematic", value: "cinematic" },
      { label: "Digital Art", value: "digital-art" },
      { label: "Anime", value: "anime" },
    ],
    defaultValue: "auto",
  },
];

const FLUX_COMMON_FIELDS: ImageModelParamDefinition[] = [
  {
    key: "outputFormat",
    label: "Output",
    type: "select",
    options: [
      { label: "PNG", value: "png" },
      { label: "JPEG", value: "jpeg" },
    ],
    defaultValue: "png",
  },
  {
    key: "safetyTolerance",
    label: "Safety Tolerance",
    type: "number",
    min: 0,
    max: 6,
    step: 1,
    defaultValue: 2,
  },
  {
    key: "promptUpsampling",
    label: "Prompt Upsampling",
    type: "boolean",
    defaultValue: true,
  },
];

const MODEL_PARAM_CONFIGS: ImageModelParamConfig[] = [
  {
    provider: "openai",
    model: "gpt-image-1",
    fields: OPENAI_GPT_IMAGE_FIELDS,
  },
  {
    provider: "openai",
    model: "dall-e-3",
    fields: OPENAI_DALLE_FIELDS,
  },
  {
    provider: "stability",
    model: "stable-image-core",
    fields: STABILITY_COMMON_FIELDS,
  },
  {
    provider: "stability",
    model: "stable-image-ultra",
    fields: STABILITY_COMMON_FIELDS,
  },
  {
    provider: "stability",
    model: "sd3-large",
    fields: STABILITY_COMMON_FIELDS,
  },
  {
    provider: "flux",
    model: "flux-pro",
    fields: FLUX_COMMON_FIELDS,
  },
  {
    provider: "flux",
    model: "flux-dev",
    fields: FLUX_COMMON_FIELDS,
  },
  {
    provider: "flux",
    model: "flux-schnell",
    fields: FLUX_COMMON_FIELDS,
  },
];

export const getImageModelParamDefinitions = (
  provider: ImageProviderId,
  model: string
): ImageModelParamDefinition[] =>
  MODEL_PARAM_CONFIGS.find((entry) => entry.provider === provider && entry.model === model)?.fields ??
  [];

export const getDefaultImageModelParams = (
  provider: ImageProviderId,
  model: string
): Record<string, ImageModelParamValue> =>
  getImageModelParamDefinitions(provider, model).reduce<Record<string, ImageModelParamValue>>(
    (accumulator, field) => {
      accumulator[field.key] = field.defaultValue;
      return accumulator;
    },
    {}
  );
