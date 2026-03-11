import { z } from "zod";
import { getImageModelCapabilityFactByModelId } from "./imageModelCapabilityFacts";
import type { FrontendImageModelId } from "./imageModelCatalog";
export type {
  ImageModelParamDefinition,
  ImageModelParamOption,
  ImageModelParamValue,
} from "./imageModelParamTypes";
import type { ImageModelParamDefinition, ImageModelParamValue } from "./imageModelParamTypes";

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
  modelId: FrontendImageModelId | string
): ImageModelParamDefinition[] => getImageModelCapabilityFactByModelId(modelId)?.parameterDefinitions ?? [];

export const getDefaultImageModelParams = (
  modelId: FrontendImageModelId | string
): Record<string, ImageModelParamValue> =>
  getImageModelParamDefinitions(modelId).reduce<Record<string, ImageModelParamValue>>(
    (accumulator, field) => {
      accumulator[field.key] = field.defaultValue;
      return accumulator;
    },
    {}
  );

export const sanitizeImageModelParams = (
  modelId: FrontendImageModelId | string,
  modelParams: Record<string, ImageModelParamValue>
): Record<string, ImageModelParamValue> =>
  getImageModelParamDefinitions(modelId).reduce<Record<string, ImageModelParamValue>>(
    (accumulator, field) => {
      accumulator[field.key] = normalizeModelParamValue(field, modelParams[field.key]);
      return accumulator;
    },
    {}
  );

export const appendImageModelParamIssues = (
  modelId: FrontendImageModelId | string,
  modelParams: Record<string, ImageModelParamValue>,
  ctx: z.RefinementCtx
) => {
  const definitions = getImageModelParamDefinitions(modelId);
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
