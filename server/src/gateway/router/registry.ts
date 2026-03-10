import type { ImageModelParamDefinition } from "../../../../shared/imageModelParams";
import { getConfig } from "../../config";
import type {
  ImageOperation,
  LegacyProviderAlias,
  ModelFamilyId,
  ModelFamilySpec,
  ModelSpec,
  OperationCapability,
  ProviderRouteTarget,
  ProviderSpec,
  RouterSelectionInput,
  RuntimeProviderId,
} from "./types";

const PROVIDERS: ProviderSpec[] = [
  {
    id: "ark",
    name: "Ark",
    credentialSlot: "ark",
    operations: ["generate", "upscale"],
    healthScope: "model_operation",
  },
  {
    id: "dashscope",
    name: "DashScope",
    credentialSlot: "dashscope",
    operations: ["generate", "upscale"],
    healthScope: "model_operation",
  },
  {
    id: "kling",
    name: "Kling",
    credentialSlot: "kling",
    operations: ["generate", "upscale"],
    healthScope: "model_operation",
  },
];

const MODEL_FAMILIES: ModelFamilySpec[] = [
  {
    id: "seedream",
    provider: "ark",
    displayName: "Seedream",
    legacyProviderAliases: ["seedream"],
  },
  {
    id: "qwen",
    provider: "dashscope",
    displayName: "Qwen Image",
    legacyProviderAliases: ["qwen"],
  },
  {
    id: "zimage",
    provider: "dashscope",
    displayName: "Z Image",
    legacyProviderAliases: ["zimage"],
  },
  {
    id: "kling",
    provider: "kling",
    displayName: "Kling",
    legacyProviderAliases: ["kling"],
  },
];

const NO_REFERENCE_SUPPORT = {
  enabled: false,
  maxImages: 0,
  supportedTypes: [],
  supportsWeight: false,
} as const;

const COMMON_ASPECT_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"] as const;
const WIDESCREEN_ASPECT_RATIOS = [...COMMON_ASPECT_RATIOS, "21:9"] as const;
const CUSTOM_WIDESCREEN_ASPECT_RATIOS = [...WIDESCREEN_ASPECT_RATIOS, "custom"] as const;

const SEEDREAM_PARAMETER_DEFINITIONS: ImageModelParamDefinition[] = [
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

const QWEN_PARAMETER_DEFINITIONS: ImageModelParamDefinition[] = [
  {
    key: "promptExtend",
    label: "Prompt Rewrite",
    type: "boolean",
    description: "Let the provider expand and refine the prompt.",
    defaultValue: true,
  },
];

const ZIMAGE_PARAMETER_DEFINITIONS: ImageModelParamDefinition[] = [
  {
    key: "promptExtend",
    label: "Prompt Rewrite",
    type: "boolean",
    description: "Return the rewritten prompt and reasoning alongside the image.",
    defaultValue: false,
  },
];

const KLING_PARAMETER_DEFINITIONS: ImageModelParamDefinition[] = [
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

const buildGenerateCapability = (input: {
  supportedAspectRatios: readonly string[];
  supportsCustomSize?: boolean;
  maxBatchSize: number;
  referenceImages?: {
    enabled: boolean;
    maxImages: number;
    supportedTypes: string[];
    supportsWeight: boolean;
    maxFileSizeBytes?: number;
  };
  unsupportedFields: string[];
  parameterDefinitions?: ImageModelParamDefinition[];
  fallbackModelIds?: string[];
}): OperationCapability => ({
  operation: "generate",
  enabled: true,
  supportsCustomSize: Boolean(input.supportsCustomSize),
  supportedAspectRatios: [...input.supportedAspectRatios],
  maxBatchSize: input.maxBatchSize,
  referenceImages: input.referenceImages
    ? {
        ...input.referenceImages,
        supportedTypes: [...input.referenceImages.supportedTypes],
      }
    : {
        ...NO_REFERENCE_SUPPORT,
        supportedTypes: [...NO_REFERENCE_SUPPORT.supportedTypes],
      },
  unsupportedFields: [...input.unsupportedFields],
  parameterDefinitions: [...(input.parameterDefinitions ?? [])],
  ...(input.fallbackModelIds ? { fallbackModelIds: [...input.fallbackModelIds] } : {}),
});

const buildDisabledUpscaleCapability = (): OperationCapability => ({
  operation: "upscale",
  enabled: false,
  supportsCustomSize: false,
  supportedAspectRatios: [],
  maxBatchSize: 1,
  referenceImages: {
    ...NO_REFERENCE_SUPPORT,
    supportedTypes: [...NO_REFERENCE_SUPPORT.supportedTypes],
  },
  unsupportedFields: [],
  parameterDefinitions: [],
});

const MODELS: ModelSpec[] = [
  {
    id: "doubao-seedream-5-0-260128",
    family: "seedream",
    displayName: "Seedream 5.0",
    description: "Ark text-to-image generation",
    operations: {
      generate: buildGenerateCapability({
        supportedAspectRatios: COMMON_ASPECT_RATIOS,
        maxBatchSize: 1,
        unsupportedFields: ["negativePrompt", "seed", "guidanceScale", "steps"],
        parameterDefinitions: SEEDREAM_PARAMETER_DEFINITIONS,
      }),
      upscale: buildDisabledUpscaleCapability(),
    },
  },
  {
    id: "doubao-seedream-4-0-250828",
    family: "seedream",
    displayName: "Seedream 4.0",
    description: "Ark text-to-image generation",
    operations: {
      generate: buildGenerateCapability({
        supportedAspectRatios: COMMON_ASPECT_RATIOS,
        maxBatchSize: 1,
        unsupportedFields: ["negativePrompt", "seed", "guidanceScale", "steps"],
        parameterDefinitions: SEEDREAM_PARAMETER_DEFINITIONS,
      }),
      upscale: buildDisabledUpscaleCapability(),
    },
  },
  {
    id: "qwen-image-2.0-pro",
    family: "qwen",
    displayName: "Qwen Image 2.0 Pro",
    description: "DashScope synchronous text-to-image",
    operations: {
      generate: buildGenerateCapability({
        supportedAspectRatios: CUSTOM_WIDESCREEN_ASPECT_RATIOS,
        supportsCustomSize: true,
        maxBatchSize: 6,
        unsupportedFields: ["guidanceScale", "steps"],
        parameterDefinitions: QWEN_PARAMETER_DEFINITIONS,
      }),
      upscale: buildDisabledUpscaleCapability(),
    },
  },
  {
    id: "qwen-image-2.0",
    family: "qwen",
    displayName: "Qwen Image 2.0",
    description: "DashScope synchronous text-to-image",
    operations: {
      generate: buildGenerateCapability({
        supportedAspectRatios: CUSTOM_WIDESCREEN_ASPECT_RATIOS,
        supportsCustomSize: true,
        maxBatchSize: 6,
        unsupportedFields: ["guidanceScale", "steps"],
        parameterDefinitions: QWEN_PARAMETER_DEFINITIONS,
      }),
      upscale: buildDisabledUpscaleCapability(),
    },
  },
  {
    id: "z-image-turbo",
    family: "zimage",
    displayName: "Z Image Turbo",
    description: "DashScope lightweight text-to-image",
    operations: {
      generate: buildGenerateCapability({
        supportedAspectRatios: CUSTOM_WIDESCREEN_ASPECT_RATIOS,
        supportsCustomSize: true,
        maxBatchSize: 1,
        unsupportedFields: ["negativePrompt", "guidanceScale", "steps"],
        parameterDefinitions: ZIMAGE_PARAMETER_DEFINITIONS,
      }),
      upscale: buildDisabledUpscaleCapability(),
    },
  },
  {
    id: "kling-v2-1",
    family: "kling",
    displayName: "Kling v2.1",
    description: "Kling official image generation API",
    operations: {
      generate: buildGenerateCapability({
        supportedAspectRatios: WIDESCREEN_ASPECT_RATIOS,
        maxBatchSize: 9,
        unsupportedFields: ["seed", "guidanceScale", "steps"],
        parameterDefinitions: KLING_PARAMETER_DEFINITIONS,
      }),
      upscale: buildDisabledUpscaleCapability(),
    },
  },
  {
    id: "kling-v3",
    family: "kling",
    displayName: "Kling v3",
    description: "Kling official image generation API",
    operations: {
      generate: buildGenerateCapability({
        supportedAspectRatios: WIDESCREEN_ASPECT_RATIOS,
        maxBatchSize: 9,
        unsupportedFields: ["seed", "guidanceScale", "steps"],
        parameterDefinitions: KLING_PARAMETER_DEFINITIONS,
      }),
      upscale: buildDisabledUpscaleCapability(),
    },
  },
];

const providersById = new Map(PROVIDERS.map((provider) => [provider.id, provider]));
const modelFamiliesById = new Map(MODEL_FAMILIES.map((family) => [family.id, family]));
const modelsById = new Map(MODELS.map((model) => [model.id, model]));

const cloneOperationCapability = (capability: OperationCapability): OperationCapability => ({
  ...capability,
  supportedAspectRatios: [...capability.supportedAspectRatios],
  referenceImages: {
    ...capability.referenceImages,
    supportedTypes: [...capability.referenceImages.supportedTypes],
  },
  unsupportedFields: [...capability.unsupportedFields],
  parameterDefinitions: capability.parameterDefinitions.map((definition) => ({
    ...definition,
    ...(definition.options
      ? {
          options: definition.options.map((option) => ({ ...option })),
        }
      : {}),
  })),
  ...(capability.fallbackModelIds ? { fallbackModelIds: [...capability.fallbackModelIds] } : {}),
});

const resolveRequestedFamily = (providerId: string): ModelFamilySpec | null => {
  const family = modelFamiliesById.get(providerId as ModelFamilyId);
  if (family) {
    return family;
  }

  return (
    MODEL_FAMILIES.find((candidate) =>
      candidate.legacyProviderAliases.includes(providerId as LegacyProviderAlias)
    ) ?? null
  );
};

export const getRuntimeProviders = () => PROVIDERS.map((provider) => ({ ...provider }));

export const getRuntimeModelFamilies = () => MODEL_FAMILIES.map((family) => ({ ...family }));

export const getRuntimeModels = () =>
  MODELS.map((model) => ({
    ...model,
    operations: Object.fromEntries(
      Object.entries(model.operations).map(([operation, capability]) => [
        operation,
        capability ? cloneOperationCapability(capability) : capability,
      ])
    ) as ModelSpec["operations"],
  }));

export const getRuntimeProviderById = (providerId: RuntimeProviderId) =>
  providersById.get(providerId);

export const getRuntimeModelFamilyById = (familyId: ModelFamilyId) =>
  modelFamiliesById.get(familyId);

export const getRuntimeModelById = (modelId: string) => modelsById.get(modelId);

export const getRuntimeProviderKey = (providerId: RuntimeProviderId) => {
  const config = getConfig();
  switch (providerId) {
    case "ark":
      return config.arkApiKey?.trim() ?? "";
    case "dashscope":
      return config.dashscopeApiKey?.trim() ?? "";
    case "kling":
      return config.klingApiKey?.trim() ?? "";
  }
};

export const getRuntimeProviderConfiguration = (providerId: RuntimeProviderId) => {
  const apiKey = getRuntimeProviderKey(providerId);
  return {
    configured: Boolean(apiKey),
    missingCredential: !apiKey,
  };
};

export const getLegacyProviderAliasForModel = (modelId: string): LegacyProviderAlias | null => {
  const model = modelsById.get(modelId);
  if (!model) {
    return null;
  }

  const family = modelFamiliesById.get(model.family);
  return family?.legacyProviderAliases[0] ?? null;
};

export const getRuntimeProviderIdForModel = (modelId: string): RuntimeProviderId | null => {
  const model = modelsById.get(modelId);
  if (!model) {
    return null;
  }

  const family = modelFamiliesById.get(model.family);
  return family?.provider ?? null;
};

export const normalizeProviderForLegacySchema = (providerId: string, modelId: string) => {
  const requestedFamily = resolveRequestedFamily(providerId);
  if (requestedFamily) {
    return requestedFamily.legacyProviderAliases[0] ?? providerId;
  }

  const provider = providersById.get(providerId as RuntimeProviderId);
  if (!provider) {
    return providerId;
  }

  const model = modelsById.get(modelId);
  if (!model) {
    return providerId;
  }

  const family = modelFamiliesById.get(model.family);
  if (!family || family.provider !== provider.id) {
    return providerId;
  }

  return family.legacyProviderAliases[0] ?? providerId;
};

export const resolveRouteTarget = (input: RouterSelectionInput): ProviderRouteTarget | null => {
  const model = modelsById.get(input.model);
  if (!model) {
    return null;
  }

  const family = modelFamiliesById.get(model.family);
  if (!family) {
    return null;
  }

  const provider = providersById.get(family.provider);
  if (!provider) {
    return null;
  }

  const requestedFamily = resolveRequestedFamily(input.providerId);
  const requestedProvider = providersById.get(input.providerId as RuntimeProviderId);
  const matchesRequestedTarget =
    requestedProvider?.id === provider.id || requestedFamily?.id === family.id;

  if (!matchesRequestedTarget) {
    return null;
  }

  const capability = model.operations[input.operation];
  if (!capability) {
    return null;
  }

  return {
    provider,
    family,
    model,
    operation: input.operation,
    capability,
    legacyProviderAlias: family.legacyProviderAliases[0] ?? family.id,
  };
};

export const resolveFallbackRouteTargets = (target: ProviderRouteTarget) => {
  const fallbackModelIds = target.capability.fallbackModelIds ?? [];
  return fallbackModelIds
    .map((modelId) =>
      resolveRouteTarget({
        providerId: target.provider.id,
        model: modelId,
        operation: target.operation,
      })
    )
    .filter((entry): entry is ProviderRouteTarget => Boolean(entry));
};
