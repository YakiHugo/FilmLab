import type {
  FrontendImageModelId,
  ImageGenerationConstraintSummary,
  ImageModelDefaults,
  ImageModelPromptCompilerCapabilities,
  LogicalImageModelId,
} from "./imageModelCatalog";
import type {
  ImageAspectRatio,
  ImageModelFamilyId,
  ImageStyleId,
} from "./imageGeneration";
import type { ImageModelParamDefinition, ImageModelParamValue } from "./imageModelParamTypes";

export interface ImageModelCapabilityFact {
  modelId: FrontendImageModelId;
  logicalModel: LogicalImageModelId;
  modelFamily: ImageModelFamilyId;
  constraints: ImageGenerationConstraintSummary;
  parameterDefinitions: ImageModelParamDefinition[];
  defaults: ImageModelDefaults;
  promptCompiler: ImageModelPromptCompilerCapabilities;
  supportsUpscale: boolean;
}

export const PROMPT_COMPILER_CAPABILITY_VERSION = "prompt-compiler-facts.v1";

const NO_REFERENCE_SUPPORT = {
  enabled: false,
  maxImages: 0,
  supportedTypes: [],
  supportsWeight: false,
} as const;

const COMMON_ASPECT_RATIOS: ImageAspectRatio[] = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"];
const WIDESCREEN_ASPECT_RATIOS: ImageAspectRatio[] = [...COMMON_ASPECT_RATIOS, "21:9"];
const CUSTOM_WIDESCREEN_ASPECT_RATIOS: ImageAspectRatio[] = [...WIDESCREEN_ASPECT_RATIOS, "custom"];

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

const DEFAULT_ACCEPTED_OPERATIONS: ImageModelPromptCompilerCapabilities["acceptedOperations"] = [
  "image.generate",
  "image.edit",
  "image.variation",
];

const buildContinuityStrength = (
  strength: ImageModelPromptCompilerCapabilities["continuityStrength"][keyof ImageModelPromptCompilerCapabilities["continuityStrength"]]
): ImageModelPromptCompilerCapabilities["continuityStrength"] => ({
  subject: strength,
  style: strength,
  composition: strength,
  text: strength,
});

const buildReferenceRoleHandling = (
  handling: ImageModelPromptCompilerCapabilities["referenceRoleHandling"][keyof ImageModelPromptCompilerCapabilities["referenceRoleHandling"]]
): ImageModelPromptCompilerCapabilities["referenceRoleHandling"] => ({
  reference: handling,
  edit: handling,
  variation: handling,
});

const cloneParameterDefinitions = (definitions: ImageModelParamDefinition[]) =>
  definitions.map((definition) => ({
    ...definition,
    ...(definition.options ? { options: definition.options.map((option) => ({ ...option })) } : {}),
  }));

const toDefaultModelParams = (definitions: ImageModelParamDefinition[]): Record<string, ImageModelParamValue> =>
  definitions.reduce<Record<string, ImageModelParamValue>>((accumulator, definition) => {
    accumulator[definition.key] = definition.defaultValue;
    return accumulator;
  }, {});

const createCapabilityFact = (input: {
  modelId: FrontendImageModelId;
  logicalModel: LogicalImageModelId;
  modelFamily: ImageModelFamilyId;
  constraints: ImageGenerationConstraintSummary;
  parameterDefinitions: ImageModelParamDefinition[];
  promptCompiler: ImageModelPromptCompilerCapabilities;
  defaultAspectRatio?: ImageAspectRatio;
  defaultStyle?: ImageStyleId;
  supportsUpscale?: boolean;
}) => {
  const parameterDefinitions = cloneParameterDefinitions(input.parameterDefinitions);
  const defaults: ImageModelDefaults = {
    aspectRatio: input.defaultAspectRatio ?? input.constraints.supportedAspectRatios[0] ?? "1:1",
    width: null,
    height: null,
    batchSize: 1,
    negativePrompt: "",
    style: input.defaultStyle ?? "none",
    stylePreset: "",
    seed: null,
    guidanceScale: null,
    steps: null,
    sampler: "",
    modelParams: toDefaultModelParams(parameterDefinitions),
  };

  return {
    modelId: input.modelId,
    logicalModel: input.logicalModel,
    modelFamily: input.modelFamily,
    constraints: {
      ...input.constraints,
      supportedAspectRatios: [...input.constraints.supportedAspectRatios],
      referenceImages: {
        ...input.constraints.referenceImages,
        supportedTypes: [...input.constraints.referenceImages.supportedTypes],
      },
      unsupportedFields: [...input.constraints.unsupportedFields],
    },
    parameterDefinitions,
    defaults,
    promptCompiler: {
      ...input.promptCompiler,
      acceptedOperations: [...input.promptCompiler.acceptedOperations],
      executableOperations: [...input.promptCompiler.executableOperations],
      referenceRoleHandling: { ...input.promptCompiler.referenceRoleHandling },
      continuityStrength: { ...input.promptCompiler.continuityStrength },
    },
    supportsUpscale: input.supportsUpscale ?? false,
  } satisfies ImageModelCapabilityFact;
};

const CAPABILITY_FACTS: ImageModelCapabilityFact[] = [
  createCapabilityFact({
    modelId: "seedream-v5",
    logicalModel: "image.seedream.v5",
    modelFamily: "seedream",
    parameterDefinitions: SEEDREAM_COMMON_FIELDS,
    promptCompiler: {
      acceptedOperations: DEFAULT_ACCEPTED_OPERATIONS,
      executableOperations: ["image.generate"],
      negativePromptStrategy: "merge_into_main",
      sourceImageExecution: "unsupported",
      referenceRoleHandling: buildReferenceRoleHandling("compiled_to_text"),
      continuityStrength: buildContinuityStrength("weak"),
      promptSurface: "natural_language",
    },
    constraints: {
      supportsCustomSize: false,
      supportedAspectRatios: COMMON_ASPECT_RATIOS,
      maxBatchSize: 1,
      referenceImages: { ...NO_REFERENCE_SUPPORT, supportedTypes: [] },
      unsupportedFields: ["negativePrompt", "seed", "guidanceScale", "steps"],
    },
  }),
  createCapabilityFact({
    modelId: "seedream-v4",
    logicalModel: "image.seedream.v4",
    modelFamily: "seedream",
    parameterDefinitions: SEEDREAM_COMMON_FIELDS,
    promptCompiler: {
      acceptedOperations: DEFAULT_ACCEPTED_OPERATIONS,
      executableOperations: ["image.generate"],
      negativePromptStrategy: "merge_into_main",
      sourceImageExecution: "unsupported",
      referenceRoleHandling: buildReferenceRoleHandling("compiled_to_text"),
      continuityStrength: buildContinuityStrength("weak"),
      promptSurface: "natural_language",
    },
    constraints: {
      supportsCustomSize: false,
      supportedAspectRatios: COMMON_ASPECT_RATIOS,
      maxBatchSize: 1,
      referenceImages: { ...NO_REFERENCE_SUPPORT, supportedTypes: [] },
      unsupportedFields: ["negativePrompt", "seed", "guidanceScale", "steps"],
    },
  }),
  createCapabilityFact({
    modelId: "qwen-image-2-pro",
    logicalModel: "image.qwen.v2.pro",
    modelFamily: "qwen",
    parameterDefinitions: QWEN_FIELDS,
    promptCompiler: {
      acceptedOperations: DEFAULT_ACCEPTED_OPERATIONS,
      executableOperations: ["image.generate"],
      negativePromptStrategy: "native",
      sourceImageExecution: "reference_guided",
      referenceRoleHandling: {
        reference: "native",
        edit: "compiled_to_reference",
        variation: "compiled_to_reference",
      },
      continuityStrength: buildContinuityStrength("strong"),
      promptSurface: "natural_language",
    },
    constraints: {
      supportsCustomSize: true,
      supportedAspectRatios: CUSTOM_WIDESCREEN_ASPECT_RATIOS,
      maxBatchSize: 6,
      referenceImages: {
        enabled: true,
        maxImages: 3,
        supportedTypes: ["content"],
        supportsWeight: false,
        maxFileSizeBytes: 10 * 1024 * 1024,
      },
      unsupportedFields: ["guidanceScale", "steps"],
    },
  }),
  createCapabilityFact({
    modelId: "qwen-image-2",
    logicalModel: "image.qwen.v2",
    modelFamily: "qwen",
    parameterDefinitions: QWEN_FIELDS,
    promptCompiler: {
      acceptedOperations: DEFAULT_ACCEPTED_OPERATIONS,
      executableOperations: ["image.generate"],
      negativePromptStrategy: "native",
      sourceImageExecution: "unsupported",
      referenceRoleHandling: buildReferenceRoleHandling("compiled_to_text"),
      continuityStrength: buildContinuityStrength("moderate"),
      promptSurface: "natural_language",
    },
    constraints: {
      supportsCustomSize: true,
      supportedAspectRatios: CUSTOM_WIDESCREEN_ASPECT_RATIOS,
      maxBatchSize: 6,
      referenceImages: { ...NO_REFERENCE_SUPPORT, supportedTypes: [] },
      unsupportedFields: ["guidanceScale", "steps"],
    },
  }),
  createCapabilityFact({
    modelId: "zimage-turbo",
    logicalModel: "image.zimage.turbo",
    modelFamily: "zimage",
    parameterDefinitions: Z_IMAGE_FIELDS,
    promptCompiler: {
      acceptedOperations: DEFAULT_ACCEPTED_OPERATIONS,
      executableOperations: ["image.generate"],
      negativePromptStrategy: "merge_into_main",
      sourceImageExecution: "unsupported",
      referenceRoleHandling: buildReferenceRoleHandling("compiled_to_text"),
      continuityStrength: buildContinuityStrength("moderate"),
      promptSurface: "natural_language",
    },
    constraints: {
      supportsCustomSize: true,
      supportedAspectRatios: CUSTOM_WIDESCREEN_ASPECT_RATIOS,
      maxBatchSize: 1,
      referenceImages: { ...NO_REFERENCE_SUPPORT, supportedTypes: [] },
      unsupportedFields: ["negativePrompt", "guidanceScale", "steps"],
    },
  }),
  createCapabilityFact({
    modelId: "kling-v2-1",
    logicalModel: "image.kling.v2_1",
    modelFamily: "kling",
    parameterDefinitions: KLING_FIELDS,
    promptCompiler: {
      acceptedOperations: DEFAULT_ACCEPTED_OPERATIONS,
      executableOperations: ["image.generate"],
      negativePromptStrategy: "native",
      sourceImageExecution: "unsupported",
      referenceRoleHandling: buildReferenceRoleHandling("compiled_to_text"),
      continuityStrength: buildContinuityStrength("moderate"),
      promptSurface: "natural_language",
    },
    constraints: {
      supportsCustomSize: false,
      supportedAspectRatios: WIDESCREEN_ASPECT_RATIOS,
      maxBatchSize: 9,
      referenceImages: { ...NO_REFERENCE_SUPPORT, supportedTypes: [] },
      unsupportedFields: ["seed", "guidanceScale", "steps"],
    },
  }),
  createCapabilityFact({
    modelId: "kling-v3",
    logicalModel: "image.kling.v3",
    modelFamily: "kling",
    parameterDefinitions: KLING_FIELDS,
    promptCompiler: {
      acceptedOperations: DEFAULT_ACCEPTED_OPERATIONS,
      executableOperations: ["image.generate"],
      negativePromptStrategy: "native",
      sourceImageExecution: "unsupported",
      referenceRoleHandling: buildReferenceRoleHandling("compiled_to_text"),
      continuityStrength: buildContinuityStrength("moderate"),
      promptSurface: "natural_language",
    },
    constraints: {
      supportsCustomSize: false,
      supportedAspectRatios: WIDESCREEN_ASPECT_RATIOS,
      maxBatchSize: 9,
      referenceImages: { ...NO_REFERENCE_SUPPORT, supportedTypes: [] },
      unsupportedFields: ["seed", "guidanceScale", "steps"],
    },
  }),
];

const capabilityFactsByModelId = new Map(
  CAPABILITY_FACTS.map((fact) => [fact.modelId, fact] as const)
);
const capabilityFactsByLogicalModel = new Map(
  CAPABILITY_FACTS.map((fact) => [fact.logicalModel, fact] as const)
);

const cloneCapabilityFact = (fact: ImageModelCapabilityFact): ImageModelCapabilityFact => ({
  ...fact,
  constraints: {
    ...fact.constraints,
    supportedAspectRatios: [...fact.constraints.supportedAspectRatios],
    referenceImages: {
      ...fact.constraints.referenceImages,
      supportedTypes: [...fact.constraints.referenceImages.supportedTypes],
    },
    unsupportedFields: [...fact.constraints.unsupportedFields],
  },
  parameterDefinitions: cloneParameterDefinitions(fact.parameterDefinitions),
  defaults: {
    ...fact.defaults,
    modelParams: { ...fact.defaults.modelParams },
  },
  promptCompiler: {
    ...fact.promptCompiler,
    acceptedOperations: [...fact.promptCompiler.acceptedOperations],
    executableOperations: [...fact.promptCompiler.executableOperations],
    referenceRoleHandling: { ...fact.promptCompiler.referenceRoleHandling },
    continuityStrength: { ...fact.promptCompiler.continuityStrength },
  },
});

export const getImageModelCapabilityFacts = () => CAPABILITY_FACTS.map(cloneCapabilityFact);

export const getImageModelCapabilityFactByModelId = (
  modelId: FrontendImageModelId | string
) => {
  const fact = capabilityFactsByModelId.get(modelId as FrontendImageModelId);
  return fact ? cloneCapabilityFact(fact) : null;
};

export const getImageModelCapabilityFactByLogicalModel = (
  logicalModel: LogicalImageModelId | string
) => {
  const fact = capabilityFactsByLogicalModel.get(logicalModel as LogicalImageModelId);
  return fact ? cloneCapabilityFact(fact) : null;
};
