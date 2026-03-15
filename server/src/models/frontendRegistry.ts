import { getImageModelCapabilityFactByLogicalModel } from "../../../shared/imageModelCapabilityFacts";
import type { FrontendImageModelId } from "../../../shared/imageModelCatalog";
import type { FrontendModelSpec } from "../gateway/router/types";

const createFrontendModel = (
  input: Pick<FrontendModelSpec, "id" | "label" | "logicalModel" | "capability" | "description"> & {
    visible?: boolean;
  }
): FrontendModelSpec => {
  const capabilityFact = getImageModelCapabilityFactByLogicalModel(input.logicalModel);
  if (!capabilityFact || capabilityFact.modelId !== input.id) {
    throw new Error(`Missing capability fact for frontend model ${input.id}.`);
  }

  return {
    ...input,
    modelFamily: capabilityFact.modelFamily,
    routingPolicy: "default",
    supportsUpscale: capabilityFact.supportsUpscale,
    constraints: capabilityFact.constraints,
    parameterDefinitions: capabilityFact.parameterDefinitions,
    defaults: capabilityFact.defaults,
    promptCompiler: capabilityFact.promptCompiler,
    visible: input.visible ?? true,
  };
};

const FRONTEND_MODELS: FrontendModelSpec[] = [
  createFrontendModel({
    id: "seedream-v5",
    label: "Seedream 5.0",
    logicalModel: "image.seedream.v5",
    capability: "image.generate",
    description: "Ark text-to-image generation",
  }),
  createFrontendModel({
    id: "seedream-v4",
    label: "Seedream 4.0",
    logicalModel: "image.seedream.v4",
    capability: "image.generate",
    description: "Ark text-to-image generation",
  }),
  createFrontendModel({
    id: "qwen-image-2-pro",
    label: "Qwen Image 2.0 Pro",
    logicalModel: "image.qwen.v2.pro",
    capability: "image.generate",
    description: "DashScope synchronous text-to-image",
  }),
  createFrontendModel({
    id: "qwen-image-2",
    label: "Qwen Image 2.0",
    logicalModel: "image.qwen.v2",
    capability: "image.generate",
    description: "DashScope synchronous text-to-image",
  }),
  createFrontendModel({
    id: "zimage-turbo",
    label: "Z Image Turbo",
    logicalModel: "image.zimage.turbo",
    capability: "image.generate",
    description: "DashScope lightweight text-to-image",
  }),
  createFrontendModel({
    id: "kling-v2-1",
    label: "Kling v2.1",
    logicalModel: "image.kling.v2_1",
    capability: "image.generate",
    description: "Kling official image generation API",
  }),
  createFrontendModel({
    id: "kling-v3",
    label: "Kling v3",
    logicalModel: "image.kling.v3",
    capability: "image.generate",
    description: "Kling official image generation API",
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
