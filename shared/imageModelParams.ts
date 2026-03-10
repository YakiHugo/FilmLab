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

const QWEN_FIELDS: ImageModelParamDefinition[] = [
  {
    key: "promptExtend",
    label: "Prompt Rewrite",
    type: "boolean",
    description: "Let the provider expand and refine the prompt.",
    defaultValue: true,
  },
];

const Z_IMAGE_FIELDS: ImageModelParamDefinition[] = [
  {
    key: "promptExtend",
    label: "Prompt Rewrite",
    type: "boolean",
    description: "Return the rewritten prompt and reasoning alongside the image.",
    defaultValue: false,
  },
];

const KLING_FIELDS: ImageModelParamDefinition[] = [
  {
    key: "resolution",
    label: "Resolution",
    type: "select",
    options: [
      { label: "1K", value: "1k" },
      { label: "2K", value: "2k" },
    ],
    defaultValue: "1k",
  },
  {
    key: "watermark",
    label: "Watermark",
    type: "boolean",
    description: "Also request watermarked result URLs from Kling.",
    defaultValue: false,
  },
];

const MODEL_PARAM_CONFIGS: ImageModelParamConfig[] = [
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
    provider: "qwen",
    model: "qwen-image-2.0-pro",
    fields: QWEN_FIELDS,
  },
  {
    provider: "qwen",
    model: "qwen-image-2.0",
    fields: QWEN_FIELDS,
  },
  {
    provider: "zimage",
    model: "z-image-turbo",
    fields: Z_IMAGE_FIELDS,
  },
  {
    provider: "kling",
    model: "kling-v2-1",
    fields: KLING_FIELDS,
  },
  {
    provider: "kling",
    model: "kling-v3",
    fields: KLING_FIELDS,
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
