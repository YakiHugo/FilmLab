import type { ImageAspectRatio } from "../../../shared/imageGeneration";
import { getDefaultImageModelParams, getImageModelParamDefinitions } from "../../../shared/imageModelParams";
import type { FrontendImageModelId } from "../../../shared/imageModelCatalog";
import type { FrontendModelSpec } from "../gateway/router/types";

const NO_REFERENCE_SUPPORT = {
  enabled: false,
  maxImages: 0,
  supportedTypes: [],
  supportsWeight: false,
} as const;

const COMMON_ASPECT_RATIOS: ImageAspectRatio[] = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"];
const WIDESCREEN_ASPECT_RATIOS: ImageAspectRatio[] = [...COMMON_ASPECT_RATIOS, "21:9"];
const CUSTOM_WIDESCREEN_ASPECT_RATIOS: ImageAspectRatio[] = [...WIDESCREEN_ASPECT_RATIOS, "custom"];

const createFrontendModel = (
  input: Omit<FrontendModelSpec, "routingPolicy" | "visible" | "parameterDefinitions" | "defaults"> & {
    defaultAspectRatio?: ImageAspectRatio;
  }
): FrontendModelSpec => ({
  ...input,
  routingPolicy: "primary",
  visible: true,
  parameterDefinitions: getImageModelParamDefinitions(input.id),
  defaults: {
    aspectRatio: input.defaultAspectRatio ?? input.constraints.supportedAspectRatios[0] ?? "1:1",
    width: null,
    height: null,
    batchSize: 1,
    negativePrompt: "",
    style: "none",
    stylePreset: "",
    seed: null,
    guidanceScale: null,
    steps: null,
    sampler: "",
    modelParams: getDefaultImageModelParams(input.id),
  },
});

const FRONTEND_MODELS: FrontendModelSpec[] = [
  createFrontendModel({
    id: "seedream-v5",
    label: "Seedream 5.0",
    logicalModel: "image.seedream.v5",
    capability: "image.generate",
    description: "Ark text-to-image generation",
    constraints: {
      supportsCustomSize: false,
      supportedAspectRatios: COMMON_ASPECT_RATIOS,
      maxBatchSize: 1,
      referenceImages: { ...NO_REFERENCE_SUPPORT, supportedTypes: [] },
      unsupportedFields: ["negativePrompt", "seed", "guidanceScale", "steps"],
    },
  }),
  createFrontendModel({
    id: "seedream-v4",
    label: "Seedream 4.0",
    logicalModel: "image.seedream.v4",
    capability: "image.generate",
    description: "Ark text-to-image generation",
    constraints: {
      supportsCustomSize: false,
      supportedAspectRatios: COMMON_ASPECT_RATIOS,
      maxBatchSize: 1,
      referenceImages: { ...NO_REFERENCE_SUPPORT, supportedTypes: [] },
      unsupportedFields: ["negativePrompt", "seed", "guidanceScale", "steps"],
    },
  }),
  createFrontendModel({
    id: "qwen-image-2-pro",
    label: "Qwen Image 2.0 Pro",
    logicalModel: "image.qwen.v2.pro",
    capability: "image.generate",
    description: "DashScope synchronous text-to-image",
    constraints: {
      supportsCustomSize: true,
      supportedAspectRatios: CUSTOM_WIDESCREEN_ASPECT_RATIOS,
      maxBatchSize: 6,
      referenceImages: { ...NO_REFERENCE_SUPPORT, supportedTypes: [] },
      unsupportedFields: ["guidanceScale", "steps"],
    },
  }),
  createFrontendModel({
    id: "qwen-image-2",
    label: "Qwen Image 2.0",
    logicalModel: "image.qwen.v2",
    capability: "image.generate",
    description: "DashScope synchronous text-to-image",
    constraints: {
      supportsCustomSize: true,
      supportedAspectRatios: CUSTOM_WIDESCREEN_ASPECT_RATIOS,
      maxBatchSize: 6,
      referenceImages: { ...NO_REFERENCE_SUPPORT, supportedTypes: [] },
      unsupportedFields: ["guidanceScale", "steps"],
    },
  }),
  createFrontendModel({
    id: "zimage-turbo",
    label: "Z Image Turbo",
    logicalModel: "image.zimage.turbo",
    capability: "image.generate",
    description: "DashScope lightweight text-to-image",
    constraints: {
      supportsCustomSize: true,
      supportedAspectRatios: CUSTOM_WIDESCREEN_ASPECT_RATIOS,
      maxBatchSize: 1,
      referenceImages: { ...NO_REFERENCE_SUPPORT, supportedTypes: [] },
      unsupportedFields: ["negativePrompt", "guidanceScale", "steps"],
    },
  }),
  createFrontendModel({
    id: "kling-v2-1",
    label: "Kling v2.1",
    logicalModel: "image.kling.v2_1",
    capability: "image.generate",
    description: "Kling official image generation API",
    constraints: {
      supportsCustomSize: false,
      supportedAspectRatios: WIDESCREEN_ASPECT_RATIOS,
      maxBatchSize: 9,
      referenceImages: { ...NO_REFERENCE_SUPPORT, supportedTypes: [] },
      unsupportedFields: ["seed", "guidanceScale", "steps"],
    },
  }),
  createFrontendModel({
    id: "kling-v3",
    label: "Kling v3",
    logicalModel: "image.kling.v3",
    capability: "image.generate",
    description: "Kling official image generation API",
    constraints: {
      supportsCustomSize: false,
      supportedAspectRatios: WIDESCREEN_ASPECT_RATIOS,
      maxBatchSize: 9,
      referenceImages: { ...NO_REFERENCE_SUPPORT, supportedTypes: [] },
      unsupportedFields: ["seed", "guidanceScale", "steps"],
    },
  }),
];

const modelsById = new Map(FRONTEND_MODELS.map((model) => [model.id, model]));

export const getFrontendImageModels = () =>
  FRONTEND_MODELS.map((model) => ({
    ...model,
    constraints: {
      ...model.constraints,
      supportedAspectRatios: [...model.constraints.supportedAspectRatios],
      referenceImages: {
        ...model.constraints.referenceImages,
        supportedTypes: [...model.constraints.referenceImages.supportedTypes],
      },
      unsupportedFields: [...model.constraints.unsupportedFields],
    },
    parameterDefinitions: model.parameterDefinitions.map((definition) => ({
      ...definition,
      ...(definition.options
        ? { options: definition.options.map((option) => ({ ...option })) }
        : {}),
    })),
    defaults: {
      ...model.defaults,
      modelParams: { ...model.defaults.modelParams },
    },
  }));

export const getFrontendImageModelById = (modelId: FrontendImageModelId | string) =>
  modelsById.get(modelId as FrontendImageModelId) ?? null;
