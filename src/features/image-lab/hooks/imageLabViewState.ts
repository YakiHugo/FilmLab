import type {
  ImageLabConversationView,
  ImageLabObservabilityView,
  ImageLabPromptArtifactsView,
  ImageLabPromptArtifactView,
  ImageLabTurnRequestView,
  ImageLabTurnView,
} from "../../../../shared/imageLabViews";
import {
  getImageModelCatalogEntry,
  getRuntimeProviderEntry,
  type ImageModelCatalog,
} from "@/lib/ai/imageModelCatalog";
import { sanitizeGenerationConfig, type GenerationConfig } from "@/stores/generationConfigStore";
import type { ImageGenerationRequest, ReferenceImage } from "@/types/imageGeneration";

export interface GeneratedResultItem {
  imageUrl: string;
  imageId?: string | null;
  provider: string;
  model: string;
  mimeType?: string;
  revisedPrompt?: string | null;
  index: number;
  assetId: string | null;
  selected: boolean;
  saved: boolean;
  isUpscaling?: boolean;
  upscaleError?: string | null;
}

export interface ImageGenerationTurn {
  id: string;
  prompt: string;
  createdAt: string;
  configSnapshot: GenerationConfig;
  selectedModelId: string;
  selectedModelLabel: string;
  runtimeProvider: string;
  runtimeProviderLabel: string;
  providerModel: string;
  displayAspectRatio: string;
  displayStyleId: string;
  displayStylePresetId: string;
  displayReferenceImageCount: number;
  referencedAssetIds: string[];
  primaryAssetIds: string[];
  executedTargetLabel: string | null;
  runCount: number;
  status: "loading" | "done" | "error";
  error: string | null;
  warnings: string[];
  isSavingSelection: boolean;
  promptArtifactsStatus: "idle" | "loading" | "loaded" | "error";
  promptArtifactsError: string | null;
  promptArtifacts: ImageLabPromptArtifactView[] | null;
  results: GeneratedResultItem[];
}

export interface RuntimeResultState {
  selected?: boolean;
  isUpscaling?: boolean;
  upscaleError?: string | null;
}

export type RuntimeResultStateMap = Record<string, Record<number, RuntimeResultState>>;

export type PromptArtifactLoadStatus = "idle" | "loading" | "loaded" | "error";

export interface PromptArtifactTurnState {
  status: PromptArtifactLoadStatus;
  error: string | null;
  versions: ImageLabPromptArtifactView[] | null;
}

export type PromptArtifactTurnStateMap = Record<string, PromptArtifactTurnState>;

export interface PromptObservabilityState {
  conversationId: string;
  status: PromptArtifactLoadStatus;
  error: string | null;
  summary: ImageLabObservabilityView | null;
}

export interface PendingConversationTurn {
  id: string;
  prompt: string;
  request: GenerationConfig;
  createdAt: string;
  runtimeProvider: string;
  providerModel: string;
}

export const RETRY_REFERENCE_IMAGES_OMITTED_WARNING =
  "Reference images from history are no longer available and were omitted. This retry will run without them, so re-upload the reference images if you need the same result.";

export const cloneGenerationConfig = (config: GenerationConfig): GenerationConfig => ({
  ...config,
  promptIntent: {
    preserve: [...config.promptIntent.preserve],
    avoid: [...config.promptIntent.avoid],
    styleDirectives: [...config.promptIntent.styleDirectives],
    continuityTargets: [...config.promptIntent.continuityTargets],
    editOps: config.promptIntent.editOps.map((entry) => ({ ...entry })),
  },
  referenceImages: config.referenceImages.map((entry) => ({ ...entry })),
  assetRefs: config.assetRefs.map((entry) => ({ ...entry })),
  modelParams: { ...config.modelParams },
});

const toReferenceImage = (
  entry: ImageLabTurnRequestView["referenceImages"][number],
  index: number
): ReferenceImage => ({
  id: entry.id || `persisted-ref-${index}`,
  url: entry.url ?? "",
  ...(entry.fileName ? { fileName: entry.fileName } : {}),
  type: entry.type,
  ...(typeof entry.weight === "number" ? { weight: entry.weight } : {}),
  ...(entry.sourceAssetId ? { sourceAssetId: entry.sourceAssetId } : {}),
});

export const toGenerationConfigFromRequest = (
  request: ImageLabTurnRequestView
): GenerationConfig => ({
  modelId: request.modelId,
  aspectRatio: request.aspectRatio as GenerationConfig["aspectRatio"],
  width: request.width,
  height: request.height,
  style: request.style as GenerationConfig["style"],
  stylePreset: request.stylePreset,
  negativePrompt: request.negativePrompt,
  promptIntent: {
    preserve: [...request.promptIntent.preserve],
    avoid: [...request.promptIntent.avoid],
    styleDirectives: [...request.promptIntent.styleDirectives],
    continuityTargets: [...request.promptIntent.continuityTargets],
    editOps: request.promptIntent.editOps.map((entry) => ({ ...entry })),
  },
  referenceImages: request.referenceImages.map(toReferenceImage),
  assetRefs: request.assetRefs.map((entry) => ({ ...entry })),
  seed: request.seed,
  guidanceScale: request.guidanceScale,
  steps: request.steps,
  sampler: request.sampler,
  batchSize: request.batchSize,
  modelParams: { ...request.modelParams },
});

export const toImageGenerationRequest = (
  prompt: string,
  config: GenerationConfig
): ImageGenerationRequest => ({
  prompt,
  modelId: config.modelId,
  aspectRatio: config.aspectRatio,
  width: config.width ?? undefined,
  height: config.height ?? undefined,
  style: config.style,
  stylePreset: config.stylePreset || undefined,
  negativePrompt: config.negativePrompt || undefined,
  promptIntent: {
    preserve: [...config.promptIntent.preserve],
    avoid: [...config.promptIntent.avoid],
    styleDirectives: [...config.promptIntent.styleDirectives],
    continuityTargets: [...config.promptIntent.continuityTargets],
    editOps: config.promptIntent.editOps.map((entry) => ({ ...entry })),
  },
  referenceImages: config.referenceImages.map((entry) => ({ ...entry })),
  assetRefs: config.assetRefs.map((entry) => ({ ...entry })),
  ...(typeof config.seed === "number" ? { seed: config.seed } : {}),
  ...(typeof config.guidanceScale === "number" ? { guidanceScale: config.guidanceScale } : {}),
  ...(typeof config.steps === "number" ? { steps: config.steps } : {}),
  ...(config.sampler ? { sampler: config.sampler } : {}),
  batchSize: config.batchSize,
  modelParams: { ...config.modelParams },
});

export const createPromptArtifactTurnState = (
  overrides?: Partial<PromptArtifactTurnState>
): PromptArtifactTurnState => ({
  status: "idle",
  error: null,
  versions: null,
  ...overrides,
});

export const shouldFetchPromptArtifacts = (
  turnStatus: ImageLabTurnView["status"],
  currentState?: Pick<PromptArtifactTurnState, "status"> | null
) =>
  turnStatus !== "loading" &&
  currentState?.status !== "loaded" &&
  currentState?.status !== "loading";

const createPromptObservabilityState = (
  conversationId: string,
  overrides?: Partial<PromptObservabilityState>
): PromptObservabilityState => ({
  conversationId,
  status: "idle",
  error: null,
  summary: null,
  ...overrides,
});

export const invalidatePromptObservabilityState = (
  conversationId: string | null | undefined,
  currentState: PromptObservabilityState | null
): PromptObservabilityState | null => {
  if (!currentState) {
    return null;
  }

  if (!conversationId || currentState.conversationId !== conversationId) {
    return null;
  }

  return createPromptObservabilityState(conversationId, {
    summary: currentState.summary,
  });
};

export const shouldFetchPromptObservability = (
  conversationId: string | null | undefined,
  currentState?: Pick<PromptObservabilityState, "conversationId" | "status"> | null
) => {
  if (!conversationId) {
    return false;
  }

  if (!currentState || currentState.conversationId !== conversationId) {
    return true;
  }

  return currentState.status !== "loaded" && currentState.status !== "loading";
};

export const omitUnavailableReferenceImages = (
  config: GenerationConfig
): { config: GenerationConfig; warnings: string[] } => {
  const unavailableReferenceImages = config.referenceImages.filter(
    (referenceImage) => typeof referenceImage.url !== "string" || referenceImage.url.trim().length === 0
  );

  if (unavailableReferenceImages.length === 0) {
    return {
      config,
      warnings: [],
    };
  }

  const omittedSourceAssetIds = new Set(
    unavailableReferenceImages
      .map((referenceImage) => referenceImage.sourceAssetId)
      .filter((assetId): assetId is string => typeof assetId === "string" && assetId.trim().length > 0)
  );

  return {
    config: {
      ...config,
      referenceImages: config.referenceImages.filter(
        (referenceImage) =>
          typeof referenceImage.url === "string" && referenceImage.url.trim().length > 0
      ),
      assetRefs: config.assetRefs.filter(
        (assetRef) =>
          assetRef.role !== "reference" || !omittedSourceAssetIds.has(assetRef.assetId)
      ),
    },
    warnings: [RETRY_REFERENCE_IMAGES_OMITTED_WARNING],
  };
};

export const toImageGenerationTurn = (
  turn: ImageLabTurnView,
  runtimeState: Record<number, RuntimeResultState> | undefined,
  isSavingSelection: boolean,
  promptArtifactState: PromptArtifactTurnState | undefined,
  catalog: ImageModelCatalog | null | undefined
): ImageGenerationTurn => {
  const selectedModel = getImageModelCatalogEntry(catalog, turn.request.modelId);
  const runtimeProviderLabel =
    getRuntimeProviderEntry(catalog, turn.runtimeProvider)?.name ?? turn.runtimeProvider;
  const configSnapshot = sanitizeGenerationConfig(
    toGenerationConfigFromRequest(turn.request),
    selectedModel
  );

  return {
    id: turn.id,
    prompt: turn.prompt,
    createdAt: turn.createdAt,
    configSnapshot,
    selectedModelId: turn.request.modelId,
    selectedModelLabel: selectedModel?.label ?? turn.request.modelId,
    runtimeProvider: turn.runtimeProvider,
    runtimeProviderLabel,
    providerModel: turn.providerModel,
    displayAspectRatio: turn.request.aspectRatio,
    displayStyleId: turn.request.style,
    displayStylePresetId: turn.request.stylePreset,
    displayReferenceImageCount: turn.request.referenceImages.length,
    referencedAssetIds: [...turn.referencedAssetIds],
    primaryAssetIds: [...turn.primaryAssetIds],
    executedTargetLabel: turn.executedTargetLabel,
    runCount: turn.runCount,
    status: turn.status,
    error: turn.error,
    warnings: [...turn.warnings],
    isSavingSelection,
    promptArtifactsStatus: promptArtifactState?.status ?? "idle",
    promptArtifactsError: promptArtifactState?.error ?? null,
    promptArtifacts: promptArtifactState?.versions ?? null,
    results: turn.results.map((result) => {
      const state = runtimeState?.[result.index];
      return {
        imageUrl: result.imageUrl,
        imageId: result.imageId,
        provider: result.provider,
        model: result.model,
        ...(result.mimeType ? { mimeType: result.mimeType } : {}),
        ...(result.revisedPrompt !== undefined ? { revisedPrompt: result.revisedPrompt } : {}),
        index: result.index,
        assetId: result.assetId,
        saved: result.saved,
        selected: state?.selected ?? !result.saved,
        isUpscaling: state?.isUpscaling,
        upscaleError: state?.upscaleError ?? null,
      };
    }),
  };
};

export const toPendingTurnView = (
  pendingTurn: PendingConversationTurn,
  catalog: ImageModelCatalog | null | undefined
): ImageGenerationTurn => {
  const selectedModel = getImageModelCatalogEntry(catalog, pendingTurn.request.modelId);
  const runtimeProviderLabel =
    getRuntimeProviderEntry(catalog, pendingTurn.runtimeProvider)?.name ??
    pendingTurn.runtimeProvider;

  return {
    id: pendingTurn.id,
    prompt: pendingTurn.prompt,
    createdAt: pendingTurn.createdAt,
    configSnapshot: cloneGenerationConfig(pendingTurn.request),
    selectedModelId: pendingTurn.request.modelId,
    selectedModelLabel: selectedModel?.label ?? pendingTurn.request.modelId,
    runtimeProvider: pendingTurn.runtimeProvider,
    runtimeProviderLabel,
    providerModel: pendingTurn.providerModel,
    displayAspectRatio: pendingTurn.request.aspectRatio,
    displayStyleId: pendingTurn.request.style,
    displayStylePresetId: pendingTurn.request.stylePreset,
    displayReferenceImageCount: pendingTurn.request.referenceImages.length,
    referencedAssetIds: pendingTurn.request.assetRefs.map((entry) => entry.assetId),
    primaryAssetIds: [],
    executedTargetLabel: null,
    runCount: 0,
    status: "loading",
    error: null,
    warnings: [],
    isSavingSelection: false,
    promptArtifactsStatus: "idle",
    promptArtifactsError: null,
    promptArtifacts: null,
    results: [],
  };
};

export const mergeTurnsWithPending = (
  conversation: ImageLabConversationView | null,
  pendingTurns: PendingConversationTurn[],
  runtimeResults: RuntimeResultStateMap,
  savingTurnIds: Record<string, boolean>,
  promptArtifacts: PromptArtifactTurnStateMap,
  catalog: ImageModelCatalog | null | undefined
): ImageGenerationTurn[] => {
  const committedTurnIds = new Set(conversation?.turns.map((turn) => turn.id) ?? []);
  const optimisticTurns = pendingTurns
    .filter((turn) => !committedTurnIds.has(turn.id))
    .map((turn) => toPendingTurnView(turn, catalog));
  const persistedTurns = (conversation?.turns ?? []).map((turn) =>
    toImageGenerationTurn(
      turn,
      runtimeResults[turn.id],
      Boolean(savingTurnIds[turn.id]),
      promptArtifacts[turn.id],
      catalog
    )
  );

  return [...optimisticTurns, ...persistedTurns].sort(
    (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)
  );
};

export const applyPromptArtifactsResponse = (
  previous: PromptArtifactTurnStateMap,
  response: ImageLabPromptArtifactsView
): PromptArtifactTurnStateMap => ({
  ...previous,
  [response.turnId]: createPromptArtifactTurnState({
    status: "loaded",
    versions: response.versions,
  }),
});
