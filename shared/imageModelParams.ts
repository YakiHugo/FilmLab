import { z } from "zod";
import type { ImageProviderId } from "./imageGeneration";

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
    key: "quality",
    label: "Quality",
    type: "select",
    options: [
      { label: "Auto", value: "auto" },
      { label: "Low", value: "low" },
      { label: "Medium", value: "medium" },
      { label: "High", value: "high" },
    ],
    defaultValue: "auto",
  },
  {
    key: "background",
    label: "Background",
    type: "select",
    options: [
      { label: "Auto", value: "auto" },
      { label: "Opaque", value: "opaque" },
      { label: "Transparent", value: "transparent" },
    ],
    defaultValue: "auto",
  },
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

const IDEOGRAM_FIELDS: ImageModelParamDefinition[] = [
  {
    key: "renderingSpeed",
    label: "Render Speed",
    type: "select",
    options: [
      { label: "Flash", value: "FLASH" },
      { label: "Turbo", value: "TURBO" },
      { label: "Default", value: "DEFAULT" },
      { label: "Quality", value: "QUALITY" },
    ],
    defaultValue: "TURBO",
  },
  {
    key: "magicPrompt",
    label: "Magic Prompt",
    type: "select",
    options: [
      { label: "Auto", value: "AUTO" },
      { label: "On", value: "ON" },
      { label: "Off", value: "OFF" },
    ],
    defaultValue: "AUTO",
  },
];

const SEEDREAM_COMMON_FIELDS: ImageModelParamDefinition[] = [
  {
    key: "responseFormat",
    label: "Response Format",
    type: "select",
    description: "Ark image generation response payload format.",
    options: [
      { label: "URL", value: "url" },
      { label: "Base64", value: "b64_json" },
    ],
    defaultValue: "url",
  },
  {
    key: "watermark",
    label: "Watermark",
    type: "boolean",
    description: "Whether to keep provider watermark in generated images.",
    defaultValue: true,
  },
  {
    key: "sequentialImageGeneration",
    label: "Sequential Generation",
    type: "select",
    description: "Generate batch images sequentially or in parallel when supported.",
    options: [
      { label: "Disabled", value: "disabled" },
      { label: "Enabled", value: "enabled" },
    ],
    defaultValue: "disabled",
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
  {
    provider: "ideogram",
    model: "ideogram-3",
    fields: IDEOGRAM_FIELDS,
  },
  {
    provider: "seedream",
    model: "doubao-seedream-5-0-260128",
    fields: SEEDREAM_COMMON_FIELDS,
  },
  {
    provider: "seedream",
    model: "doubao-seedream-4-0-250828",
    fields: SEEDREAM_COMMON_FIELDS,
  },
  {
    provider: "seedream",
    model: "qwen-image-2512",
    fields: SEEDREAM_COMMON_FIELDS,
  },
  {
    provider: "seedream",
    model: "z-image-v1",
    fields: SEEDREAM_COMMON_FIELDS,
  },
  {
    provider: "seedream",
    model: "doubao-kling-o1-250424",
    fields: SEEDREAM_COMMON_FIELDS,
  },
];

const normalizeModelParamValue = (
  definition: ImageModelParamDefinition,
  value: unknown
): ImageModelParamValue => {
  if (definition.type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return definition.defaultValue;
    }
    const minimum = definition.min ?? value;
    const maximum = definition.max ?? value;
    return Math.min(maximum, Math.max(minimum, value));
  }

  if (definition.type === "boolean") {
    return typeof value === "boolean" ? value : definition.defaultValue;
  }

  if (typeof value !== "string") {
    return definition.defaultValue;
  }

  const optionValues = new Set((definition.options ?? []).map((option) => option.value));
  if (optionValues.size > 0 && !optionValues.has(value)) {
    return definition.defaultValue;
  }

  return value;
};

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

export const sanitizeImageModelParams = (
  provider: ImageProviderId,
  model: string,
  modelParams: Record<string, ImageModelParamValue>
): Record<string, ImageModelParamValue> =>
  getImageModelParamDefinitions(provider, model).reduce<Record<string, ImageModelParamValue>>(
    (accumulator, field) => {
      accumulator[field.key] = normalizeModelParamValue(field, modelParams[field.key]);
      return accumulator;
    },
    {}
  );

export const appendImageModelParamIssues = (
  provider: ImageProviderId,
  model: string,
  modelParams: Record<string, ImageModelParamValue>,
  ctx: z.RefinementCtx
) => {
  const definitions = getImageModelParamDefinitions(provider, model);
  const definitionsByKey = new Map(definitions.map((definition) => [definition.key, definition]));

  for (const key of Object.keys(modelParams)) {
    if (!definitionsByKey.has(key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Unsupported model param: ${key}.`,
        path: ["modelParams", key],
      });
    }
  }

  for (const definition of definitions) {
    const value = modelParams[definition.key];
    if (value === undefined) {
      continue;
    }

    if (definition.type === "number") {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${definition.label} must be a number.`,
          path: ["modelParams", definition.key],
        });
        continue;
      }

      if (typeof definition.min === "number" && value < definition.min) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${definition.label} must be at least ${definition.min}.`,
          path: ["modelParams", definition.key],
        });
      }

      if (typeof definition.max === "number" && value > definition.max) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${definition.label} must be at most ${definition.max}.`,
          path: ["modelParams", definition.key],
        });
      }
      continue;
    }

    if (definition.type === "boolean") {
      if (typeof value !== "boolean") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${definition.label} must be a boolean.`,
          path: ["modelParams", definition.key],
        });
      }
      continue;
    }

    if (typeof value !== "string") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${definition.label} must be a string.`,
        path: ["modelParams", definition.key],
      });
      continue;
    }

    const optionValues = new Set((definition.options ?? []).map((option) => option.value));
    if (optionValues.size > 0 && !optionValues.has(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${definition.label} must be one of: ${Array.from(optionValues).join(", ")}.`,
        path: ["modelParams", definition.key],
      });
    }
  }
};
