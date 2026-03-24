import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  GenerationJobSnapshot,
  PersistedAssetRecord,
  PersistedPromptArtifactRecord,
  PersistedRunRecord,
  PersistedImageGenerationRequestSnapshot,
  PersistedImageSession,
  PersistedGenerationTurn,
  PromptObservabilitySummaryResponse,
  PersistedResultItem,
} from "../../../../shared/chatImageTypes";
import { importAssetFiles } from "@/lib/assetImport";
import { fetchRemoteAsset } from "@/lib/assetSyncApi";
import {
  acceptImageConversationTurn,
  clearImageConversation,
  deleteImageConversationTurn,
  fetchImageConversation,
  fetchImagePromptArtifacts,
  fetchImagePromptObservability,
} from "@/lib/ai/imageConversation";
import type { ImageModelParamValue } from "@/lib/ai/imageModelParams";
import {
  generateImage as requestImageGeneration,
  type ImageGenerationRequestError,
} from "@/lib/ai/imageGeneration";
import {
  getImageModelCatalogEntry,
  getRuntimeProviderEntry,
  toCatalogFeatureSupport,
  type CatalogDrivenFeatureSupport,
  type ImageModelCatalog,
} from "@/lib/ai/imageModelCatalog";
import type { CanvasImageElement } from "@/types";
import type {
  ImageAspectRatio,
  ImageGenerationAssetRefRole,
  ImagePromptIntentInput,
  ImageGenerationRequest,
  ImageGenerationResponse,
  ImageStyleId,
  ReferenceImage,
  ReferenceImageType,
} from "@/types/imageGeneration";
import {
  IMAGE_ASPECT_RATIOS,
  IMAGE_STYLE_IDS,
  REFERENCE_IMAGE_TYPES,
  validateImageAssetRefs,
} from "@/types/imageGeneration";
import { useAssetStore } from "@/stores/assetStore";
import {
  sanitizeGenerationConfig,
  type GenerationConfig,
} from "@/stores/generationConfigStore";
import { getCanvasResetEpoch, useCanvasStore } from "@/stores/canvasStore";
import { useImageSessionStore } from "@/stores/imageSessionStore";
import {
  createId,
  resolveCanvasImageInsertionSize,
} from "@/utils";
import {
  bindResultAssetToConfig,
  bindResultReferenceToConfig,
  clearBoundResultReferencesFromConfig,
  clearReferenceImagesFromConfig,
  clearReferenceInputsForUnsupportedModel,
  removeBoundResultReferenceFromConfig,
  updateAssetRefRoleInConfig,
} from "../referenceImages";
import { useGenerationConfig } from "./useGenerationConfig";

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
  promptArtifacts: PersistedPromptArtifactRecord[] | null;
  results: GeneratedResultItem[];
}

interface RuntimeResultState {
  selected?: boolean;
  isUpscaling?: boolean;
  upscaleError?: string | null;
}

type RuntimeResultStateMap = Record<string, Record<number, RuntimeResultState>>;

type PromptArtifactLoadStatus = "idle" | "loading" | "loaded" | "error";

interface PromptArtifactTurnState {
  status: PromptArtifactLoadStatus;
  error: string | null;
  versions: PersistedPromptArtifactRecord[] | null;
}

type PromptArtifactTurnStateMap = Record<string, PromptArtifactTurnState>;

export interface PromptObservabilityState {
  conversationId: string;
  status: PromptArtifactLoadStatus;
  error: string | null;
  summary: PromptObservabilitySummaryResponse | null;
}

const createPromptArtifactTurnState = (
  overrides?: Partial<PromptArtifactTurnState>
): PromptArtifactTurnState => ({
  status: "idle",
  error: null,
  versions: null,
  ...overrides,
});

export const shouldFetchPromptArtifacts = (
  turnStatus: PersistedGenerationTurn["status"],
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

export const RETRY_REFERENCE_IMAGES_OMITTED_WARNING =
  "Reference images from history are no longer available and were omitted. This retry will run without them, so re-upload the reference images if you need the same result.";

const cloneGenerationConfig = (config: GenerationConfig): GenerationConfig => ({
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isImageAspectRatio = (value: unknown): value is ImageAspectRatio =>
  typeof value === "string" && (IMAGE_ASPECT_RATIOS as readonly string[]).includes(value);

const isImageStyleId = (value: unknown): value is ImageStyleId =>
  typeof value === "string" && (IMAGE_STYLE_IDS as readonly string[]).includes(value);

const isReferenceImageType = (value: unknown): value is ReferenceImageType =>
  typeof value === "string" && (REFERENCE_IMAGE_TYPES as readonly string[]).includes(value);

const createFallbackGenerationConfig = (): GenerationConfig => ({
  modelId: "seedream-v5",
  aspectRatio: "1:1",
  width: null,
  height: null,
  style: "none",
  stylePreset: "",
  negativePrompt: "",
  promptIntent: {
    preserve: [],
    avoid: [],
    styleDirectives: [],
    continuityTargets: [],
    editOps: [],
  },
  referenceImages: [],
  assetRefs: [],
  seed: null,
  guidanceScale: null,
  steps: null,
  sampler: "",
  batchSize: 1,
  modelParams: {},
});

const serializeConfig = (config: GenerationConfig): Record<string, unknown> => ({
  ...config,
  promptIntent: {
    preserve: [...config.promptIntent.preserve],
    avoid: [...config.promptIntent.avoid],
    styleDirectives: [...config.promptIntent.styleDirectives],
    continuityTargets: [...config.promptIntent.continuityTargets],
    editOps: config.promptIntent.editOps.map((entry) => ({ ...entry })),
  },
  referenceImages: config.referenceImages.map(({ id, fileName, type, weight, sourceAssetId }) => ({
    id,
    fileName,
    type,
    weight,
    sourceAssetId,
  })),
  assetRefs: config.assetRefs.map((assetRef) => ({ ...assetRef })),
  modelParams: { ...config.modelParams },
});

const deserializeModelParams = (value: unknown): Record<string, ImageModelParamValue> => {
  if (!isRecord(value)) {
    return {};
  }

  return Object.entries(value).reduce<Record<string, ImageModelParamValue>>(
    (next, [key, entry]) => {
      if (
        typeof entry === "string" ||
        typeof entry === "number" ||
        typeof entry === "boolean" ||
        entry === null
      ) {
        next[key] = entry;
      }
      return next;
    },
    {}
  );
};

const deserializeReferenceImages = (value: unknown): ReferenceImage[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.reduce<ReferenceImage[]>((next, entry, index) => {
    if (!isRecord(entry)) {
      return next;
    }

    next.push({
      id:
        typeof entry.id === "string" && entry.id.trim()
          ? entry.id
          : `persisted-ref-${index}`,
      url: typeof entry.url === "string" ? entry.url : "",
      fileName: typeof entry.fileName === "string" ? entry.fileName : undefined,
      type: isReferenceImageType(entry.type) ? entry.type : "content",
      weight: typeof entry.weight === "number" ? entry.weight : 1,
      sourceAssetId:
        typeof entry.sourceAssetId === "string" ? entry.sourceAssetId : undefined,
    });
    return next;
  }, []);
};

const deserializePromptIntent = (value: unknown): ImagePromptIntentInput => {
  if (!isRecord(value)) {
    return {
      preserve: [],
      avoid: [],
      styleDirectives: [],
      continuityTargets: [],
      editOps: [],
    };
  }

  const toStringArray = (entry: unknown) =>
    Array.isArray(entry)
      ? entry.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [];

  const continuityTargets = Array.isArray(value.continuityTargets)
    ? value.continuityTargets.filter(
        (entry): entry is ImagePromptIntentInput["continuityTargets"][number] =>
          entry === "subject" ||
          entry === "style" ||
          entry === "composition" ||
          entry === "text"
      )
    : [];
  const editOps = Array.isArray(value.editOps)
    ? value.editOps
        .filter(
          (entry): entry is ImagePromptIntentInput["editOps"][number] =>
            isRecord(entry) &&
            typeof entry.op === "string" &&
            typeof entry.target === "string"
        )
        .map((entry) => ({
          op: entry.op,
          target: entry.target,
          ...(typeof entry.value === "string" ? { value: entry.value } : {}),
        }))
    : [];

  return {
    preserve: toStringArray(value.preserve),
    avoid: toStringArray(value.avoid),
    styleDirectives: toStringArray(value.styleDirectives),
    continuityTargets,
    editOps,
  };
};

export const deserializeAssetRefs = (
  value: unknown
): GenerationConfig["assetRefs"] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.reduce<GenerationConfig["assetRefs"]>((next, entry) => {
    if (!isRecord(entry) || typeof entry.assetId !== "string") {
      return next;
    }

    const role =
      entry.role === "edit" || entry.role === "variation" ? entry.role : "reference";
    next.push({
      assetId: entry.assetId,
      role,
      ...(role === "reference"
        ? {
            referenceType: isReferenceImageType(entry.referenceType)
              ? entry.referenceType
              : "content",
            weight: typeof entry.weight === "number" ? entry.weight : 1,
          }
        : {}),
    });
    return next;
  }, []);
};

const deserializedConfigCache = new WeakMap<Record<string, unknown>, GenerationConfig>();

const deserializeConfig = (
  snapshot: Record<string, unknown>,
  catalog: ImageModelCatalog | null | undefined
): GenerationConfig => {
  const cached = deserializedConfigCache.get(snapshot);
  if (cached) {
    return cached;
  }

  const fallbackConfig = createFallbackGenerationConfig();
  const fallbackModel = catalog?.models[0] ?? null;
  const requestedModelId =
    typeof snapshot.modelId === "string" ? snapshot.modelId : fallbackModel?.id ?? fallbackConfig.modelId;
  const selectedModel =
    getImageModelCatalogEntry(catalog, requestedModelId) ?? fallbackModel;

  const nextConfig = sanitizeGenerationConfig({
    ...fallbackConfig,
    modelId: selectedModel?.id ?? fallbackConfig.modelId,
    aspectRatio: isImageAspectRatio(snapshot.aspectRatio)
      ? snapshot.aspectRatio
      : fallbackConfig.aspectRatio,
    width: typeof snapshot.width === "number" ? snapshot.width : fallbackConfig.width,
    height: typeof snapshot.height === "number" ? snapshot.height : fallbackConfig.height,
    style: isImageStyleId(snapshot.style) ? snapshot.style : fallbackConfig.style,
    stylePreset:
      typeof snapshot.stylePreset === "string" ? snapshot.stylePreset : fallbackConfig.stylePreset,
    negativePrompt:
      typeof snapshot.negativePrompt === "string"
        ? snapshot.negativePrompt
        : fallbackConfig.negativePrompt,
    promptIntent: deserializePromptIntent(snapshot.promptIntent),
    referenceImages: deserializeReferenceImages(snapshot.referenceImages),
    assetRefs: deserializeAssetRefs(snapshot.assetRefs),
    seed: typeof snapshot.seed === "number" ? snapshot.seed : fallbackConfig.seed,
    guidanceScale:
      typeof snapshot.guidanceScale === "number"
        ? snapshot.guidanceScale
        : fallbackConfig.guidanceScale,
    steps: typeof snapshot.steps === "number" ? snapshot.steps : fallbackConfig.steps,
    sampler: typeof snapshot.sampler === "string" ? snapshot.sampler : fallbackConfig.sampler,
    batchSize:
      typeof snapshot.batchSize === "number" ? snapshot.batchSize : fallbackConfig.batchSize,
    modelParams: deserializeModelParams(snapshot.modelParams),
  }, selectedModel);

  deserializedConfigCache.set(snapshot, nextConfig);
  return nextConfig;
};

const resolveSnapshotDisplayMeta = (
  snapshot: Record<string, unknown>,
  catalog: ImageModelCatalog | null | undefined
) => {
  const config = deserializeConfig(snapshot, catalog);
  const selectedModel = getImageModelCatalogEntry(catalog, config.modelId);

  return {
    modelId: config.modelId,
    modelLabel: selectedModel?.label ?? config.modelId,
    aspectRatio:
      typeof snapshot.aspectRatio === "string" && snapshot.aspectRatio.trim()
        ? snapshot.aspectRatio
        : config.aspectRatio,
    styleId:
      typeof snapshot.style === "string" && snapshot.style.trim()
        ? snapshot.style
        : config.style,
    stylePresetId:
      typeof snapshot.stylePreset === "string" && snapshot.stylePreset.trim()
        ? snapshot.stylePreset
        : config.stylePreset,
    referenceImageCount: Array.isArray(snapshot.referenceImages)
      ? snapshot.referenceImages.length
      : config.referenceImages.length,
  };
};

const isRetryableModel = (
  catalog: ImageModelCatalog | null | undefined,
  modelId: string
) => Boolean(getImageModelCatalogEntry(catalog, modelId));

const buildUnavailableModelError = (modelLabel: string) =>
  `${modelLabel} is no longer available. Choose a current model and run the prompt again.`;

const cloneImageRequest = (
  request: ImageGenerationRequest
): ImageGenerationRequest & Record<string, unknown> =>
  JSON.parse(JSON.stringify(request)) as ImageGenerationRequest & Record<string, unknown>;

export const toPersistedRequestSnapshot = (
  request: ImageGenerationRequest
): PersistedImageGenerationRequestSnapshot => {
  const snapshot = cloneImageRequest(request) as PersistedImageGenerationRequestSnapshot;
  if (!Array.isArray(snapshot.referenceImages)) {
    return snapshot;
  }

  return {
    ...snapshot,
    referenceImages: snapshot.referenceImages.map(
      ({ id, url, fileName, type, weight, sourceAssetId }, index) => ({
        id: typeof id === "string" && id.trim() ? id : `persisted-ref-${index}`,
        url,
        fileName,
        type,
        weight,
        sourceAssetId,
      })
    ),
  };
};

export const resolveRetryRequestSnapshot = (
  snapshot: PersistedImageGenerationRequestSnapshot
): { request: ImageGenerationRequest; warnings: string[] } => {
  if (!Array.isArray(snapshot.referenceImages) || snapshot.referenceImages.length === 0) {
    return {
      request: cloneImageRequest(snapshot as ImageGenerationRequest),
      warnings: [],
    };
  }

  const usableReferenceImages = snapshot.referenceImages.filter(
    (referenceImage): referenceImage is ReferenceImage =>
      typeof referenceImage.url === "string" && referenceImage.url.trim().length > 0
  );
  const nextSnapshot: ImageGenerationRequest = {
    ...(cloneImageRequest(snapshot as ImageGenerationRequest) as ImageGenerationRequest),
    referenceImages: usableReferenceImages,
  };

  return {
    request: nextSnapshot,
    warnings:
      usableReferenceImages.length === snapshot.referenceImages.length
        ? []
        : [RETRY_REFERENCE_IMAGES_OMITTED_WARNING],
  };
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

const toPersistedResultsFromResponse = (
  response: ImageGenerationResponse
): PersistedResultItem[] =>
  response.images.map((image, index) => ({
    id: image.resultId ?? `${response.turnId}-result-${index}`,
    imageUrl: image.imageUrl,
    imageId: image.imageId ?? null,
    threadAssetId: image.assetId ?? response.primaryAssetIds[index] ?? null,
    runtimeProvider: image.provider,
    providerModel: image.model,
    mimeType: image.mimeType,
    revisedPrompt: image.revisedPrompt ?? null,
    index,
    assetId: image.assetId ?? response.primaryAssetIds[index] ?? null,
    saved: true,
  }));

const toUITurn = (
  turn: PersistedGenerationTurn,
  relatedRuns: PersistedRunRecord[],
  runtimeResults: Record<number, RuntimeResultState> | undefined,
  isSavingSelection: boolean,
  promptArtifactState: PromptArtifactTurnState | undefined,
  catalog: ImageModelCatalog | null | undefined
): ImageGenerationTurn => {
  const displayMeta = resolveSnapshotDisplayMeta(turn.configSnapshot, catalog);
  const runtimeProviderLabel =
    getRuntimeProviderEntry(catalog, turn.runtimeProvider)?.name ?? turn.runtimeProvider;
  const latestRun = relatedRuns[0] ?? null;
  const executedTargetLabel = latestRun?.executedTarget
    ? `${latestRun.executedTarget.runtimeProvider} / ${latestRun.executedTarget.providerModel}`
    : null;

  return {
    id: turn.id,
    prompt: turn.prompt,
    createdAt: turn.createdAt,
    configSnapshot: deserializeConfig(turn.configSnapshot, catalog),
    selectedModelId: displayMeta.modelId,
    selectedModelLabel: displayMeta.modelLabel,
    runtimeProvider: turn.runtimeProvider,
    runtimeProviderLabel,
    providerModel: turn.providerModel,
    displayAspectRatio: displayMeta.aspectRatio,
    displayStyleId: displayMeta.styleId,
    displayStylePresetId: displayMeta.stylePresetId,
    displayReferenceImageCount: displayMeta.referenceImageCount,
    referencedAssetIds: [...turn.referencedAssetIds],
    primaryAssetIds: [...turn.primaryAssetIds],
    executedTargetLabel,
    runCount: relatedRuns.length,
    status: turn.status,
    error: turn.error,
    warnings: turn.warnings,
    isSavingSelection,
    promptArtifactsStatus: promptArtifactState?.status ?? "idle",
    promptArtifactsError: promptArtifactState?.error ?? null,
    promptArtifacts: promptArtifactState?.versions ?? null,
    results: turn.results.map((result) => {
      const runtimeState = runtimeResults?.[result.index];
      return {
        imageUrl: result.imageUrl,
        imageId: result.imageId ?? undefined,
        provider: result.runtimeProvider,
        model: result.providerModel,
        mimeType: result.mimeType,
        revisedPrompt: result.revisedPrompt ?? null,
        index: result.index,
        assetId: result.assetId ?? result.threadAssetId,
        selected: runtimeState?.selected ?? !result.saved,
        saved: result.saved,
        isUpscaling: runtimeState?.isUpscaling ?? false,
        upscaleError: runtimeState?.upscaleError ?? null,
      };
    }),
  };
};

const REFERENCE_IMAGE_MAX_DIMENSION = 1_600;
const blobToFileExtension = (mimeType: string) =>
  mimeType.includes("jpeg") ? "jpg" : mimeType.includes("webp") ? "webp" : "png";

const readBlobAsDataUrl = (file: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string" || !reader.result) {
        reject(new Error("Could not read reference image."));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = () => reject(new Error("Could not read reference image."));
    reader.readAsDataURL(file);
  });

const loadImageFromFile = (file: File): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`Could not process reference image: ${file.name}`));
    };
    image.src = objectUrl;
  });

const renderReferenceImageBlob = async (file: File) => {
  if (typeof document === "undefined") {
    return file;
  }

  const image = await loadImageFromFile(file);
  const longestEdge = Math.max(image.naturalWidth, image.naturalHeight);
  if (longestEdge <= REFERENCE_IMAGE_MAX_DIMENSION) {
    return file;
  }

  const scale = REFERENCE_IMAGE_MAX_DIMENSION / longestEdge;
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    return file;
  }

  context.drawImage(image, 0, 0, width, height);
  const outputType = file.type === "image/png" ? "image/png" : "image/jpeg";
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, outputType, outputType === "image/jpeg" ? 0.88 : undefined);
  });
  if (!blob) {
    return file;
  }

  const extension = blobToFileExtension(blob.type);
  const baseName = file.name.replace(/\.[^.]+$/, "") || "reference";
  return new File([blob], `${baseName}.${extension}`, {
    type: blob.type,
    lastModified: file.lastModified,
  });
};

const toReferenceImageEntry = async (
  file: File,
  type: ReferenceImage["type"],
  options?: { maxFileSizeBytes?: number }
): Promise<ReferenceImage> => {
  const processedFile = await renderReferenceImageBlob(file);
  if (options?.maxFileSizeBytes && processedFile.size > options.maxFileSizeBytes) {
    throw new Error(
      `Reference image "${file.name}" is too large. Keep files under ${Math.round(
        options.maxFileSizeBytes / 1024 / 1024
      )} MB.`
    );
  }

  return {
    id: createId("reference-id"),
    url: await readBlobAsDataUrl(processedFile),
    fileName: processedFile.name,
    type,
    weight: 1,
  };
};

export const filesToReferenceImages = async (
  filesInput: FileList | File[],
  type: ReferenceImage["type"] = "content",
  options?: { maxFileSizeBytes?: number }
): Promise<ReferenceImage[]> => {
  const files = Array.isArray(filesInput) ? filesInput : Array.from(filesInput);
  const entries = await Promise.all(
    files.map((file) => toReferenceImageEntry(file, type, options))
  );
  return entries;
};

const resolveAssetRoleNotice = (
  role: ImageGenerationAssetRefRole,
  supportedFeatures: CatalogDrivenFeatureSupport
) => {
  if (
    role === "reference" &&
    supportedFeatures.promptCompiler.referenceRoleHandling.reference !== "native"
  ) {
    return "Current model will treat this asset as prompt-guided reference guidance.";
  }

  if (
    role === "edit" &&
    !supportedFeatures.promptCompiler.executableOperations.includes("image.edit")
  ) {
    return "Current model will approximate this edit as prompt-guided generate.";
  }

  if (
    role === "variation" &&
    !supportedFeatures.promptCompiler.executableOperations.includes("image.variation")
  ) {
    return "Current model will approximate this variation as prompt-guided generate.";
  }

  return null;
};

const toImageRequest = (
  prompt: string,
  config: GenerationConfig,
  supportedFeatures: CatalogDrivenFeatureSupport,
  options?: { supportsCustomSize?: boolean }
): ImageGenerationRequest => ({
  prompt,
  promptIntent: {
    preserve: [...config.promptIntent.preserve],
    avoid: [...config.promptIntent.avoid],
    styleDirectives: [...config.promptIntent.styleDirectives],
    continuityTargets: [...config.promptIntent.continuityTargets],
    editOps: config.promptIntent.editOps.map((entry) => ({ ...entry })),
  },
  modelId: config.modelId,
  aspectRatio: config.aspectRatio,
  width: options?.supportsCustomSize ? (config.width ?? undefined) : undefined,
  height: options?.supportsCustomSize ? (config.height ?? undefined) : undefined,
  style: supportedFeatures.styles ? config.style : "none",
  stylePreset: config.stylePreset || undefined,
  negativePrompt: supportedFeatures.negativePrompt ? config.negativePrompt || undefined : undefined,
  assetRefs: config.assetRefs,
  seed: supportedFeatures.seed ? (config.seed ?? undefined) : undefined,
  guidanceScale: supportedFeatures.guidanceScale ? (config.guidanceScale ?? undefined) : undefined,
  steps: supportedFeatures.steps ? (config.steps ?? undefined) : undefined,
  sampler: config.sampler || undefined,
  batchSize: config.batchSize,
  modelParams: config.modelParams,
});

export async function generateImages(
  request: ImageGenerationRequest,
  options?: { signal?: AbortSignal }
): Promise<ImageGenerationResponse> {
  return requestImageGeneration(request, options);
}

export function useImageGeneration() {
  const {
    catalog,
    catalogError,
    isCatalogLoading,
    config,
    models,
    providers,
    styles,
    modelConfig,
    modelParamDefinitions,
    supportedFeatures,
    setConfig,
    setModel: setModelInConfig,
    updateConfig,
    removeReferenceImage: removeReferenceImageInConfig,
  } = useGenerationConfig();
  const session = useImageSessionStore((state) => state.session);
  const replaceSession = useImageSessionStore((state) => state.replaceSession);
  const addTurnWithJob = useImageSessionStore((state) => state.addTurnWithJob);
  const updateTurn = useImageSessionStore((state) => state.updateTurn);
  const updateJob = useImageSessionStore((state) => state.updateJob);

  const [savingTurnIds, setSavingTurnIds] = useState<Record<string, boolean>>({});
  const [runtimeResults, setRuntimeResults] = useState<RuntimeResultStateMap>({});
  const [promptArtifacts, setPromptArtifacts] = useState<PromptArtifactTurnStateMap>({});
  const [promptObservability, setPromptObservability] = useState<PromptObservabilityState | null>(
    null
  );
  const [notice, setNotice] = useState<string | null>(null);
  const sessionRef = useRef(session);
  const serverConversationIdRef = useRef<string | null>(null);
  const savingTurnIdsRef = useRef(savingTurnIds);
  const runtimeResultsRef = useRef(runtimeResults);
  const promptArtifactsRef = useRef(promptArtifacts);
  const promptObservabilityRef = useRef(promptObservability);
  const snapshotVersionRef = useRef(0);
  const snapshotRequestAbortRef = useRef<AbortController | null>(null);
  const promptArtifactAbortRef = useRef(new Map<string, AbortController>());
  const promptObservabilityAbortRef = useRef<AbortController | null>(null);
  const uiTurnCacheRef = useRef(
    new Map<
      string,
      {
        turn: PersistedGenerationTurn;
        runs: PersistedRunRecord[];
        runtimeResults: Record<number, RuntimeResultState> | undefined;
        isSavingSelection: boolean;
        promptArtifacts: PromptArtifactTurnState | undefined;
        uiTurn: ImageGenerationTurn;
      }
    >()
  );
  const generationRequestRef = useRef<{
    controller: AbortController;
    turnId: string;
    jobId: string;
  } | null>(null);

  sessionRef.current = session;
  savingTurnIdsRef.current = savingTurnIds;
  runtimeResultsRef.current = runtimeResults;
  promptArtifactsRef.current = promptArtifacts;
  promptObservabilityRef.current = promptObservability;

  useEffect(() => {
    const promptArtifactAbortControllers = promptArtifactAbortRef.current;
    return () => {
      generationRequestRef.current?.controller.abort();
      generationRequestRef.current = null;
      snapshotRequestAbortRef.current?.abort();
      snapshotRequestAbortRef.current = null;
      promptArtifactAbortControllers.forEach((controller) => controller.abort());
      promptArtifactAbortControllers.clear();
      promptObservabilityAbortRef.current?.abort();
      promptObservabilityAbortRef.current = null;
    };
  }, []);

  const invalidateConversationSnapshotRequests = useCallback(() => {
    snapshotVersionRef.current += 1;
    snapshotRequestAbortRef.current?.abort();
    snapshotRequestAbortRef.current = null;
  }, []);

  const resetPromptObservabilityState = useCallback((conversationId?: string | null) => {
    promptObservabilityAbortRef.current?.abort();
    promptObservabilityAbortRef.current = null;
    setPromptObservability((previous) =>
      invalidatePromptObservabilityState(conversationId ?? null, previous)
    );
  }, []);

  const applyConversationSnapshot = useCallback(
    (snapshot: PersistedImageSession) => {
      invalidateConversationSnapshotRequests();
      serverConversationIdRef.current = snapshot.id;
      resetPromptObservabilityState(snapshot.id);
      replaceSession(snapshot);
      return snapshot;
    },
    [invalidateConversationSnapshotRequests, replaceSession, resetPromptObservabilityState]
  );

  const refreshConversationSnapshot = useCallback(
    async (conversationId?: string) => {
      const requestVersion = snapshotVersionRef.current + 1;
      snapshotVersionRef.current = requestVersion;
      snapshotRequestAbortRef.current?.abort();
      const controller = new AbortController();
      snapshotRequestAbortRef.current = controller;

      try {
        const snapshot = await fetchImageConversation(
          conversationId ?? serverConversationIdRef.current ?? undefined,
          {
            signal: controller.signal,
          }
        );
        if (controller.signal.aborted || snapshotVersionRef.current !== requestVersion) {
          return null;
        }

        serverConversationIdRef.current = snapshot.id;
        resetPromptObservabilityState(snapshot.id);
        replaceSession(snapshot);
        return snapshot;
      } finally {
        if (snapshotRequestAbortRef.current === controller) {
          snapshotRequestAbortRef.current = null;
        }
      }
    },
    [replaceSession, resetPromptObservabilityState]
  );

  useEffect(() => {
    void refreshConversationSnapshot().catch(() => undefined);
  }, [refreshConversationSnapshot]);

  useEffect(() => {
    const currentState = promptObservabilityRef.current;
    const nextConversationId = session?.id ?? null;
    if (!currentState) {
      return;
    }
    if (currentState.conversationId !== nextConversationId) {
      resetPromptObservabilityState(nextConversationId);
    }
  }, [resetPromptObservabilityState, session?.id]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setNotice(null);
    }, 4_000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [notice]);

  const setTurnSavingState = useCallback((turnId: string, isSaving: boolean) => {
    setSavingTurnIds((previous) => {
      if (isSaving) {
        return {
          ...previous,
          [turnId]: true,
        };
      }

      if (!previous[turnId]) {
        return previous;
      }

      const next = { ...previous };
      delete next[turnId];
      return next;
    });
  }, []);

  const updateRuntimeResultState = useCallback(
    (
      turnId: string,
      index: number,
      updater: (state: RuntimeResultState) => RuntimeResultState
    ) => {
      setRuntimeResults((previous) => {
        const turnState = previous[turnId] ?? {};
        return {
          ...previous,
          [turnId]: {
            ...turnState,
            [index]: updater(turnState[index] ?? {}),
          },
        };
      });
    },
    []
  );

  const clearRuntimeTurnState = useCallback((turnId: string) => {
    setSavingTurnIds((previous) => {
      if (!previous[turnId]) {
        return previous;
      }
      const next = { ...previous };
      delete next[turnId];
      return next;
    });
    setRuntimeResults((previous) => {
      if (!previous[turnId]) {
        return previous;
      }
      const next = { ...previous };
      delete next[turnId];
      return next;
    });
  }, []);

  const clearPromptArtifactState = useCallback((turnId: string) => {
    promptArtifactAbortRef.current.get(turnId)?.abort();
    promptArtifactAbortRef.current.delete(turnId);
    setPromptArtifacts((previous) => {
      if (!previous[turnId]) {
        return previous;
      }
      const next = { ...previous };
      delete next[turnId];
      return next;
    });
  }, []);

  const clearAllPromptArtifactState = useCallback(() => {
    promptArtifactAbortRef.current.forEach((controller) => controller.abort());
    promptArtifactAbortRef.current.clear();
    setPromptArtifacts({});
  }, []);

  const loadPromptObservability = useCallback(async () => {
    const conversationId = sessionRef.current?.id ?? serverConversationIdRef.current;
    const cachedState = promptObservabilityRef.current;
    if (!shouldFetchPromptObservability(conversationId, cachedState)) {
      return cachedState?.summary ?? null;
    }
    if (!conversationId) {
      return null;
    }

    promptObservabilityAbortRef.current?.abort();
    const controller = new AbortController();
    promptObservabilityAbortRef.current = controller;
    setPromptObservability((previous) =>
      createPromptObservabilityState(conversationId, {
        status: "loading",
        summary:
          previous?.conversationId === conversationId ? previous.summary : null,
      })
    );

    try {
      const response = await fetchImagePromptObservability(conversationId, {
        signal: controller.signal,
      });
      if (controller.signal.aborted || promptObservabilityAbortRef.current !== controller) {
        return null;
      }

      setPromptObservability(
        createPromptObservabilityState(response.conversationId, {
          status: "loaded",
          summary: response,
        })
      );
      return response;
    } catch (error) {
      if (controller.signal.aborted) {
        return null;
      }

      const message =
        error instanceof Error
          ? error.message
          : "Prompt observability could not be loaded.";
      setPromptObservability((previous) =>
        createPromptObservabilityState(conversationId, {
          status: "error",
          error: message,
          summary:
            previous?.conversationId === conversationId ? previous.summary : null,
        })
      );
      return null;
    } finally {
      if (promptObservabilityAbortRef.current === controller) {
        promptObservabilityAbortRef.current = null;
      }
    }
  }, []);

  const getTurnById = useCallback(
    (turnId: string) => sessionRef.current?.turns.find((entry) => entry.id === turnId) ?? null,
    []
  );

  const loadPromptArtifacts = useCallback(
    async (turnId: string) => {
      const turn = getTurnById(turnId);
      if (!turn || turn.status === "loading") {
        return null;
      }

      const cachedState = promptArtifactsRef.current[turnId];
      if (!shouldFetchPromptArtifacts(turn.status, cachedState)) {
        return cachedState?.versions ?? null;
      }

      promptArtifactAbortRef.current.get(turnId)?.abort();
      const controller = new AbortController();
      promptArtifactAbortRef.current.set(turnId, controller);
      setPromptArtifacts((previous) => ({
        ...previous,
        [turnId]: createPromptArtifactTurnState({
          status: "loading",
          versions: previous[turnId]?.versions ?? null,
        }),
      }));

      try {
        const response = await fetchImagePromptArtifacts(turnId, {
          signal: controller.signal,
        });
        if (
          controller.signal.aborted ||
          promptArtifactAbortRef.current.get(turnId) !== controller
        ) {
          return null;
        }

        setPromptArtifacts((previous) => ({
          ...previous,
          [turnId]: createPromptArtifactTurnState({
            status: "loaded",
            versions: response.versions,
          }),
        }));
        return response.versions;
      } catch (error) {
        if (controller.signal.aborted) {
          return null;
        }

        const message =
          error instanceof Error ? error.message : "Prompt artifacts could not be loaded.";
        setPromptArtifacts((previous) => ({
          ...previous,
          [turnId]: createPromptArtifactTurnState({
            status: "error",
            error: message,
            versions: previous[turnId]?.versions ?? null,
          }),
        }));
        return null;
      } finally {
        if (promptArtifactAbortRef.current.get(turnId) === controller) {
          promptArtifactAbortRef.current.delete(turnId);
        }
      }
    },
    [getTurnById]
  );

  const getCachedUiTurn = useCallback(
    (
      turn: PersistedGenerationTurn,
      runs: PersistedRunRecord[],
      runtimeState: Record<number, RuntimeResultState> | undefined,
      isSavingSelection: boolean,
      promptArtifactState: PromptArtifactTurnState | undefined
    ) => {
      const cached = uiTurnCacheRef.current.get(turn.id);
      if (
        cached &&
        cached.turn === turn &&
        cached.runs === runs &&
        cached.runtimeResults === runtimeState &&
        cached.isSavingSelection === isSavingSelection &&
        cached.promptArtifacts === promptArtifactState
      ) {
        return cached.uiTurn;
      }

      const uiTurn = toUITurn(
        turn,
        runs,
        runtimeState,
        isSavingSelection,
        promptArtifactState,
        catalog
      );
      uiTurnCacheRef.current.set(turn.id, {
        turn,
        runs,
        runtimeResults: runtimeState,
        isSavingSelection,
        promptArtifacts: promptArtifactState,
        uiTurn,
      });
      return uiTurn;
    },
    [catalog]
  );

  const getUiTurnById = useCallback(
    (turnId: string) => {
      const turn = getTurnById(turnId);
      if (!turn) {
        return null;
      }

      const runs = (sessionRef.current?.runs ?? []).filter((entry) => entry.turnId === turn.id);
      return getCachedUiTurn(
        turn,
        runs,
        runtimeResultsRef.current[turnId],
        Boolean(savingTurnIdsRef.current[turnId]),
        promptArtifactsRef.current[turnId]
      );
    },
    [getCachedUiTurn, getTurnById]
  );

  const updateTurnResults = useCallback(
    (
      turnId: string,
      updater: (results: PersistedResultItem[]) => PersistedResultItem[]
    ) => {
      const turn = getTurnById(turnId);
      if (!turn) {
        return null;
      }

      const nextResults = updater(turn.results);
      updateTurn(turnId, {
        results: nextResults,
      });
      return nextResults;
    },
    [getTurnById, updateTurn]
  );

  const cancelActiveGeneration = useCallback(
    (reason: string) => {
      const activeRequest = generationRequestRef.current;
      if (!activeRequest) {
        return;
      }

      activeRequest.controller.abort();

      const activeTurn = getTurnById(activeRequest.turnId);
      if (activeTurn?.status === "loading") {
        updateTurn(activeRequest.turnId, {
          status: "error",
          error: reason,
        });
      }

      updateJob(activeRequest.jobId, {
        status: "failed",
        error: reason,
        completedAt: new Date().toISOString(),
      });
    },
    [getTurnById, updateJob, updateTurn]
  );

  const addReferenceFiles = useCallback(
    async (filesInput: FileList | File[]) => {
      if (!config) {
        return [];
      }

      const imported = await importAssetFiles(filesInput, {
        source: "imported",
        origin: "file",
      });
      const importedAssets = imported.resolvedAssetIds
        .map((assetId) => useAssetStore.getState().assets.find((asset) => asset.id === assetId) ?? null)
        .filter((asset): asset is NonNullable<typeof asset> => Boolean(asset));

      if (importedAssets.length === 0) {
        return [];
      }

      const nextConfig = importedAssets.reduce<GenerationConfig>((draftConfig, asset) => {
        return bindResultReferenceToConfig(draftConfig, {
          assetId: asset.id,
          referenceImage: {
            id: createId("reference-id"),
            url: asset.objectUrl,
            fileName: asset.name,
            type: "content",
            weight: 1,
            sourceAssetId: asset.id,
          },
        });
      }, cloneGenerationConfig(config));

      setConfig(nextConfig);
      const importedAssetIds = new Set(importedAssets.map((asset) => asset.id));
      const entries = nextConfig.referenceImages.filter((entry) =>
        entry.sourceAssetId ? importedAssetIds.has(entry.sourceAssetId) : false
      );
      return entries;
    },
    [config, setConfig]
  );

  const setModel = useCallback(
    (modelId: string) => {
      const nextModel = getImageModelCatalogEntry(catalog, modelId);
      if (!nextModel) {
        return;
      }

      if (!config) {
        setModelInConfig(modelId);
        return;
      }

      const nextConfigBase: GenerationConfig = {
        ...config,
        modelId: nextModel.id,
        modelParams: { ...nextModel.defaults.modelParams },
      };

      if (
        !toCatalogFeatureSupport(nextModel).referenceImages.enabled &&
        (config.referenceImages.length > 0 || config.assetRefs.length > 0)
      ) {
        const { nextConfig, removedReferenceImageCount, removedAssetRefCount } =
          clearReferenceInputsForUnsupportedModel(nextConfigBase);
        const removedInputCount = Math.max(
          removedReferenceImageCount,
          removedAssetRefCount
        );
        setConfig(nextConfig);
        setNotice(
          `Switched to ${nextModel.label}. Removed ${removedInputCount} image-guided input${
            removedInputCount === 1 ? "" : "s"
          } because this model does not support image-guided generation.`
        );
        return;
      }

      setConfig(nextConfigBase);
    },
    [catalog, config, setConfig, setModelInConfig]
  );

  const materializeGeneratedAssets = useCallback((response: ImageGenerationResponse) => {
    const persistedAssetsById = new Map<string, PersistedAssetRecord>(
      response.assets.map((asset) => [asset.id, asset])
    );
    const provisionalAssets = response.images.map((image, index) => {
      const persistedAsset = persistedAssetsById.get(image.assetId);
      const metadata = isRecord(persistedAsset?.metadata) ? persistedAsset.metadata : undefined;
      const thumbnailUrl =
        metadata && typeof metadata.thumbnailUrl === "string"
          ? metadata.thumbnailUrl
          : image.imageUrl;
      const mimeType =
        metadata && typeof metadata.mimeType === "string"
          ? metadata.mimeType
          : (image.mimeType ?? "image/png");

      return {
        assetId: image.assetId,
        name: persistedAsset?.label ?? `Generated image ${index + 1}`,
        type: mimeType,
        size: 0,
        createdAt: persistedAsset?.createdAt ?? response.createdAt,
        updatedAt: response.createdAt,
        source: "ai-generated" as const,
        origin: "ai" as const,
        metadata,
        objectUrl: image.imageUrl,
        thumbnailUrl,
      };
    });

    useAssetStore.getState().materializeRemoteAssets(provisionalAssets);

    const assetIds = Array.from(new Set(provisionalAssets.map((asset) => asset.assetId)));
    void Promise.allSettled(assetIds.map((assetId) => fetchRemoteAsset(assetId))).then((results) => {
      const hydratedAssets = results.flatMap((result) => {
        if (result.status !== "fulfilled") {
          return [];
        }

        const asset = result.value;
        return [
          {
            assetId: asset.assetId,
            name: asset.name,
            type: asset.type,
            size: asset.size,
            createdAt: asset.createdAt,
            updatedAt: asset.updatedAt,
            source: asset.source,
            origin: asset.origin,
            contentHash: asset.contentHash,
            tags: asset.tags,
            metadata: asset.metadata,
            objectUrl: asset.objectUrl,
            thumbnailUrl: asset.thumbnailUrl,
          },
        ];
      });

      if (hydratedAssets.length > 0) {
        useAssetStore.getState().materializeRemoteAssets(hydratedAssets);
      }

      const failedAssetIds = results.flatMap((result, index) =>
        result.status === "rejected" ? [assetIds[index] ?? "unknown"] : []
      );
      if (failedAssetIds.length > 0) {
        console.warn("Failed to hydrate generated assets in the asset store.", {
          assetIds: failedAssetIds,
        });
      }
    });
  }, []);

  const runGeneration = useCallback(
    async (options: {
      prompt: string;
      configSnapshot: GenerationConfig;
      requestSnapshot: ImageGenerationRequest;
      retryOfTurnId?: string;
      localWarnings?: string[];
    }) => {
      const prompt = options.prompt.trim();
      if (!prompt) {
        return null;
      }
      invalidateConversationSnapshotRequests();
      cancelActiveGeneration("Generation canceled by a newer request.");

      const turnId = createId("turn-id");
      const jobId = createId("job-id");
      const requestSnapshot: ImageGenerationRequest = {
        ...options.requestSnapshot,
        ...(serverConversationIdRef.current
          ? { conversationId: serverConversationIdRef.current }
          : {}),
        ...(options.retryOfTurnId
          ? { retryOfTurnId: options.retryOfTurnId, retryMode: "exact" as const }
          : {}),
        clientTurnId: turnId,
        clientJobId: jobId,
      };
      const requestModel =
        getImageModelCatalogEntry(catalog, requestSnapshot.modelId) ?? modelConfig;
      const createdAt = new Date().toISOString();
      const controller = new AbortController();

      generationRequestRef.current = {
        controller,
        turnId,
        jobId,
      };

      addTurnWithJob(
        {
          id: turnId,
          prompt,
          createdAt,
          retryOfTurnId: options.retryOfTurnId ?? null,
          modelId: requestSnapshot.modelId,
          logicalModel: requestModel?.logicalModel ?? "image.seedream.v5",
          deploymentId: requestModel?.deploymentId ?? "ark-seedream-v5-primary",
          runtimeProvider: requestModel?.defaultProvider ?? "ark",
          providerModel: requestModel?.providerModel ?? "doubao-seedream-5-0-260128",
          configSnapshot: serializeConfig(cloneGenerationConfig(options.configSnapshot)),
          status: "loading",
          error: null,
          warnings: options.localWarnings ?? [],
          jobId,
          runIds: [],
          referencedAssetIds: requestSnapshot.assetRefs?.map((assetRef) => assetRef.assetId) ?? [],
          primaryAssetIds: [],
          results: [],
        },
        {
          id: jobId,
          turnId,
          runId: null,
          modelId: requestSnapshot.modelId,
          logicalModel: requestModel?.logicalModel ?? "image.seedream.v5",
          deploymentId: requestModel?.deploymentId ?? "ark-seedream-v5-primary",
          runtimeProvider: requestModel?.defaultProvider ?? "ark",
          providerModel: requestModel?.providerModel ?? "doubao-seedream-5-0-260128",
          compiledPrompt: prompt,
          requestSnapshot: toPersistedRequestSnapshot(requestSnapshot),
          status: "running",
          error: null,
          createdAt,
          completedAt: null,
        }
      );

      try {
        const generated = await generateImages(requestSnapshot, {
          signal: controller.signal,
        });

        if (
          generationRequestRef.current?.controller !== controller ||
          generationRequestRef.current?.turnId !== turnId ||
          generationRequestRef.current?.jobId !== jobId
        ) {
          return null;
        }

        serverConversationIdRef.current = generated.conversationId;
        materializeGeneratedAssets(generated);
        updateTurn(turnId, {
          status: "done",
          error: null,
          logicalModel: generated.logicalModel,
          deploymentId: generated.deploymentId,
          runtimeProvider: generated.runtimeProvider,
          providerModel: generated.providerModel,
          warnings: [...(options.localWarnings ?? []), ...(generated.warnings ?? [])],
          runIds: generated.runs.map((run) => run.id),
          referencedAssetIds: generated.runs.flatMap((run) => run.referencedAssetIds),
          primaryAssetIds: [...generated.primaryAssetIds],
          results: toPersistedResultsFromResponse(generated),
        });
        updateJob(jobId, {
          status: "succeeded",
          error: null,
          runId: generated.runId,
          modelId: generated.modelId,
          logicalModel: generated.logicalModel,
          deploymentId: generated.deploymentId,
          runtimeProvider: generated.runtimeProvider,
          providerModel: generated.providerModel,
          completedAt: generated.createdAt,
        });
        uiTurnCacheRef.current.delete(turnId);
        clearRuntimeTurnState(turnId);
        clearPromptArtifactState(turnId);
        void refreshConversationSnapshot(generated.conversationId).catch(() => undefined);

        return generated.images;
      } catch (error) {
        if (controller.signal.aborted) {
          return null;
        }

        const errorMessage = error instanceof Error ? error.message : "Image generation failed.";
        const requestError = error as ImageGenerationRequestError;

        if (requestError.conversationId) {
          serverConversationIdRef.current = requestError.conversationId;
          void refreshConversationSnapshot(requestError.conversationId).catch(() => undefined);
        }

        updateTurn(turnId, {
          status: "error",
          primaryAssetIds: [],
          results: [],
          error: errorMessage,
          warnings: options.localWarnings ?? [],
        });
        updateJob(jobId, {
          status: "failed",
          error: errorMessage,
          completedAt: new Date().toISOString(),
        });
        uiTurnCacheRef.current.delete(turnId);
        clearRuntimeTurnState(turnId);
        clearPromptArtifactState(turnId);
        return null;
      } finally {
        if (
          generationRequestRef.current?.controller === controller &&
          generationRequestRef.current?.turnId === turnId &&
          generationRequestRef.current?.jobId === jobId
        ) {
          generationRequestRef.current = null;
        }
      }
    },
    [
      addTurnWithJob,
      catalog,
      cancelActiveGeneration,
      clearPromptArtifactState,
      clearRuntimeTurnState,
      invalidateConversationSnapshotRequests,
      modelConfig,
      materializeGeneratedAssets,
      refreshConversationSnapshot,
      updateJob,
      updateTurn,
    ]
  );

  const generateWithConfig = useCallback(
    async (
      promptInput: string,
      configSnapshot: GenerationConfig,
      options?: { retryOfTurnId?: string; localWarnings?: string[] }
    ) => {
      const prompt = promptInput.trim();
      if (!prompt || !catalog) {
        return null;
      }

      const nextConfigSnapshot = cloneGenerationConfig(configSnapshot);
      const assetRefIssues = validateImageAssetRefs(nextConfigSnapshot.assetRefs);
      if (assetRefIssues.length > 0) {
        setNotice(assetRefIssues[0]?.message ?? "Asset roles are incompatible for this turn.");
        return null;
      }
      const requestModelConfig = getImageModelCatalogEntry(catalog, nextConfigSnapshot.modelId);
      const requestSupportedFeatures = toCatalogFeatureSupport(requestModelConfig);

      return runGeneration({
        prompt,
        configSnapshot: nextConfigSnapshot,
        requestSnapshot: toImageRequest(prompt, nextConfigSnapshot, requestSupportedFeatures, {
          supportsCustomSize: Boolean(requestModelConfig?.constraints.supportsCustomSize),
        }),
        retryOfTurnId: options?.retryOfTurnId,
        localWarnings: options?.localWarnings,
      });
    },
    [catalog, runGeneration]
  );

  const retryFromSnapshot = useCallback(
    async (job: GenerationJobSnapshot, originalTurn: PersistedGenerationTurn) => {
      const selectedModel = getImageModelCatalogEntry(catalog, job.modelId);
      if (!isRetryableModel(catalog, job.modelId)) {
        const errorMessage = buildUnavailableModelError(selectedModel?.label ?? job.modelId);
        updateTurn(originalTurn.id, {
          status: "error",
          error: errorMessage,
        });
        if (job.status === "running" || job.status === "failed") {
          updateJob(job.id, {
            status: "failed",
            error: errorMessage,
            completedAt: job.completedAt ?? new Date().toISOString(),
          });
        }
        return null;
      }

      const retryRequest = resolveRetryRequestSnapshot(job.requestSnapshot);
      return runGeneration({
        prompt: originalTurn.prompt,
        configSnapshot: deserializeConfig(originalTurn.configSnapshot, catalog),
        requestSnapshot: retryRequest.request,
        retryOfTurnId: originalTurn.id,
        localWarnings: retryRequest.warnings,
      });
    },
    [catalog, runGeneration, updateJob, updateTurn]
  );

  const generateFromPromptInput = useCallback(
    async (input: { text: string }) =>
      config ? generateWithConfig(input.text, cloneGenerationConfig(config)) : null,
    [config, generateWithConfig]
  );

  const deleteTurn = useCallback(
    async (turnId: string) => {
      invalidateConversationSnapshotRequests();
      if (generationRequestRef.current?.turnId === turnId) {
        cancelActiveGeneration("Generation canceled while deleting the turn.");
        generationRequestRef.current = null;
      }

      try {
        const snapshot = await deleteImageConversationTurn(turnId);
        applyConversationSnapshot(snapshot);
        uiTurnCacheRef.current.delete(turnId);
        clearRuntimeTurnState(turnId);
        clearPromptArtifactState(turnId);
      } catch (error) {
        updateTurn(turnId, {
          error: error instanceof Error ? error.message : "Turn could not be deleted.",
        });
      }
    },
    [
      applyConversationSnapshot,
      cancelActiveGeneration,
      clearPromptArtifactState,
      clearRuntimeTurnState,
      invalidateConversationSnapshotRequests,
      updateTurn,
    ]
  );

  const acceptTurnResult = useCallback(
    async (turnId: string, index: number) => {
      const turn = getUiTurnById(turnId);
      const result = turn?.results.find((entry) => entry.index === index);
      if (!result?.assetId) {
        return null;
      }

      invalidateConversationSnapshotRequests();
      try {
        const snapshot = await acceptImageConversationTurn(turnId, result.assetId);
        applyConversationSnapshot(snapshot);
        return snapshot;
      } catch (error) {
        updateTurn(turnId, {
          error: error instanceof Error ? error.message : "Result could not be accepted.",
        });
        return null;
      }
    },
    [applyConversationSnapshot, getUiTurnById, invalidateConversationSnapshotRequests, updateTurn]
  );

  const retryTurn = useCallback(
    async (turnId: string) => {
      const turn = getTurnById(turnId);
      if (!turn) {
        return null;
      }

      const job =
        turn.jobId != null
          ? sessionRef.current?.jobs.find((entry) => entry.id === turn.jobId) ?? null
          : null;

      if (job?.requestSnapshot) {
        return retryFromSnapshot(job, turn);
      }

      if (!isRetryableModel(catalog, turn.modelId)) {
        updateTurn(turn.id, {
          status: "error",
          error: buildUnavailableModelError(turn.modelId),
        });
        return null;
      }

      const retryConfig = omitUnavailableReferenceImages(
        deserializeConfig(turn.configSnapshot, catalog)
      );

      return generateWithConfig(turn.prompt, retryConfig.config, {
        retryOfTurnId: turn.id,
        localWarnings: retryConfig.warnings,
      });
    },
    [catalog, generateWithConfig, getTurnById, retryFromSnapshot, updateTurn]
  );

  const reuseParameters = useCallback(
    (turnId: string) => {
      const turn = getTurnById(turnId);
      if (!turn) {
        return null;
      }

      if (!isRetryableModel(catalog, turn.modelId)) {
        updateTurn(turn.id, {
          status: "error",
          error: buildUnavailableModelError(turn.modelId),
        });
        return turn.prompt;
      }

      const snapshot = cloneGenerationConfig(deserializeConfig(turn.configSnapshot, catalog));
      setConfig({
        ...snapshot,
        referenceImages: [],
        assetRefs: [],
      });
      return turn.prompt;
    },
    [catalog, getTurnById, setConfig, updateTurn]
  );

  const saveSelectedResults = useCallback(
    async (turnId: string) => {
      const turn = getUiTurnById(turnId);
      if (!turn) {
        return null;
      }

      const selectedIndexes = turn.results
        .filter((entry) => entry.selected && !entry.saved)
        .map((entry) => entry.index);
      if (selectedIndexes.length === 0) {
        return null;
      }

      setTurnSavingState(turnId, true);
      updateTurn(turnId, {
        error: null,
      });

      try {
        return updateTurnResults(turnId, (results) =>
          results.map((result) =>
            selectedIndexes.includes(result.index) && result.assetId
              ? { ...result, saved: true }
              : result
          )
        );
      } catch (error) {
        updateTurn(turnId, {
          error: error instanceof Error ? error.message : "Save generated images failed.",
        });
        return null;
      } finally {
        setTurnSavingState(turnId, false);
      }
    },
    [getUiTurnById, setTurnSavingState, updateTurn, updateTurnResults]
  );

  const toggleResultSelection = useCallback(
    (turnId: string, index: number) => {
      const turn = getUiTurnById(turnId);
      const result = turn?.results.find((entry) => entry.index === index);
      if (!result || result.saved) {
        return;
      }

      updateRuntimeResultState(turnId, index, (state) => ({
        ...state,
        selected: !(state.selected ?? !result.saved),
      }));
    },
    [getUiTurnById, updateRuntimeResultState]
  );

  const bindResultAsAssetRole = useCallback(
    async (
      turnId: string,
      index: number,
      role: ImageGenerationAssetRefRole
    ) => {
      const turn = getUiTurnById(turnId);
      const result = turn?.results.find((entry) => entry.index === index);
      if (!result?.assetId || !config) {
        return;
      }

      try {
        const asset =
          useAssetStore.getState().assets.find((entry) => entry.id === result.assetId) ?? null;
        const binding =
          role === "reference" && asset
            ? {
                nextConfig: bindResultReferenceToConfig(cloneGenerationConfig(config), {
                  assetId: result.assetId,
                  referenceImage: {
                    id: createId("reference-id"),
                    url: asset.objectUrl,
                    fileName: asset.name,
                    type: "content",
                    weight: 1,
                    sourceAssetId: asset.id,
                  },
                }),
                error: null,
              }
            : bindResultAssetToConfig(cloneGenerationConfig(config), {
                assetId: result.assetId,
                role,
                includeReferenceImage: false,
                referenceImage: null,
              });
        if (binding.error) {
          setNotice(binding.error);
          return;
        }

        setConfig(binding.nextConfig);
        const notice = resolveAssetRoleNotice(role, supportedFeatures);
        if (notice) {
          setNotice(notice);
        }
      } catch (error) {
        setNotice(
          error instanceof Error
            ? error.message
            : "Generated image could not be reused for prompt-guided generation."
        );
      }
    },
    [config, getUiTurnById, setConfig, setNotice, supportedFeatures]
  );

  const useResultAsReference = useCallback(
    async (turnId: string, index: number) =>
      bindResultAsAssetRole(turnId, index, "reference"),
    [bindResultAsAssetRole]
  );

  const editFromResult = useCallback(
    async (turnId: string, index: number) =>
      bindResultAsAssetRole(turnId, index, "edit"),
    [bindResultAsAssetRole]
  );

  const varyFromResult = useCallback(
    async (turnId: string, index: number) =>
      bindResultAsAssetRole(turnId, index, "variation"),
    [bindResultAsAssetRole]
  );

  const updateAssetRefRole = useCallback(
    (assetId: string, role: ImageGenerationAssetRefRole) => {
      if (!config) {
        return;
      }

      const binding = updateAssetRefRoleInConfig(config, {
        assetId,
        role,
        includeReferenceImage: supportedFeatures.referenceImages.enabled,
      });
      if (binding.error) {
        setNotice(binding.error);
        return;
      }

      setConfig(binding.nextConfig);
      const notice = resolveAssetRoleNotice(role, supportedFeatures);
      if (notice) {
        setNotice(notice);
      }
    },
    [config, setConfig, supportedFeatures]
  );

  const removeAssetReference = useCallback(
    (assetId: string) => {
      if (!config) {
        return;
      }

      setConfig(removeBoundResultReferenceFromConfig(config, assetId));
    },
    [config, setConfig]
  );

  const clearAssetReferences = useCallback(() => {
    if (!config) {
      return;
    }

    setConfig(clearBoundResultReferencesFromConfig(config));
  }, [config, setConfig]);

  const patchReferenceImage = useCallback(
    (id: string, patch: Partial<ReferenceImage>) => {
      if (!config) {
        return;
      }

      const referenceImage = config.referenceImages.find((entry) => entry.id === id);
      setConfig({
        ...config,
        referenceImages: config.referenceImages.map((entry) =>
          entry.id === id
            ? {
                ...entry,
                ...patch,
              }
            : entry
        ),
        assetRefs: config.assetRefs.map((assetRef) =>
          assetRef.assetId === referenceImage?.sourceAssetId && assetRef.role === "reference"
            ? {
                ...assetRef,
                ...(patch.type ? { referenceType: patch.type } : {}),
                ...(typeof patch.weight === "number" ? { weight: patch.weight } : {}),
              }
            : assetRef
        ),
      });
    },
    [config, setConfig]
  );

  const removeReferenceImage = useCallback(
    (id: string) => {
      if (!config) {
        return;
      }

      const referenceImage = config.referenceImages.find((entry) => entry.id === id);
      if (referenceImage?.sourceAssetId) {
        setConfig(removeBoundResultReferenceFromConfig(config, referenceImage.sourceAssetId));
        return;
      }

      removeReferenceImageInConfig(id);
    },
    [config, removeReferenceImageInConfig, setConfig]
  );

  const clearReferenceImages = useCallback(() => {
    if (!config) {
      return;
    }

    setConfig(clearReferenceImagesFromConfig(config));
  }, [config, setConfig]);

  const upscaleResult = useCallback(
    async (turnId: string, index: number) => {
      const turn = getUiTurnById(turnId);
      const result = turn?.results.find((entry) => entry.index === index);
      if (!turn || !result || result.isUpscaling) {
        return null;
      }

      updateRuntimeResultState(turnId, index, (state) => ({
        ...state,
        isUpscaling: false,
        upscaleError: "Upscale is not available for current providers.",
      }));
      return null;
    },
    [getUiTurnById, updateRuntimeResultState]
  );

  const addToCanvas = useCallback(
    async (turnId: string, index?: number, assetId?: string | null) => {
      const turn = getUiTurnById(turnId);
      if (!turn) {
        return null;
      }

      const finalAssetId =
        assetId ??
        (typeof index === "number"
          ? (turn.results.find((entry) => entry.index === index)?.assetId ?? null)
          : (turn.results.find((entry) => entry.assetId)?.assetId ?? null));
      if (!finalAssetId) {
        return null;
      }

      let canvasStore = useCanvasStore.getState();
      if (!canvasStore.activeWorkbenchId && (canvasStore.workbenches.length === 0 || canvasStore.isLoading)) {
        await canvasStore.init();
        canvasStore = useCanvasStore.getState();
      }
      const asset = useAssetStore.getState().assets.find((entry) => entry.id === finalAssetId);
      const startEpoch = getCanvasResetEpoch();
      let workbenchId = canvasStore.activeWorkbenchId;
      let insertionIndex = 1;
      if (workbenchId) {
        const activeWorkbench = canvasStore.workbenches.find((item) => item.id === workbenchId);
        insertionIndex = (activeWorkbench?.rootIds.length ?? 0) + 1;
      } else {
        const created = await canvasStore.createWorkbench("AI 工作台");
        if (!created || startEpoch !== getCanvasResetEpoch()) {
          return null;
        }
        workbenchId = created.id;
      }
      if (!workbenchId) {
        return null;
      }

      const { width, height } = await resolveCanvasImageInsertionSize(asset, {
        minimumShortEdge: 96,
      });
      const x = 140 + insertionIndex * 24;
      const y = 120 + insertionIndex * 24;

      const element: CanvasImageElement = {
        id: createId("node-id"),
        type: "image",
        parentId: null,
        assetId: finalAssetId,
        x,
        y,
        width,
        height,
        rotation: 0,
        transform: {
          x,
          y,
          width,
          height,
          rotation: 0,
        },
        opacity: 1,
        locked: false,
        visible: true,
      };

      await canvasStore.upsertElementInWorkbench(workbenchId, element);
      const latestCanvasStore = useCanvasStore.getState();
      if (latestCanvasStore.activeWorkbenchId === workbenchId) {
        latestCanvasStore.setSelectedElementIds([element.id]);
      }
      return { workbenchId, elementId: element.id };
    },
    [getUiTurnById]
  );

  const clearSession = useCallback(async () => {
    invalidateConversationSnapshotRequests();
    if (generationRequestRef.current) {
      cancelActiveGeneration("Generation canceled while clearing the conversation.");
      generationRequestRef.current = null;
    }
    uiTurnCacheRef.current.clear();
    setSavingTurnIds({});
    setRuntimeResults({});
    clearAllPromptArtifactState();
    applyConversationSnapshot(await clearImageConversation());
  }, [
    applyConversationSnapshot,
    cancelActiveGeneration,
    clearAllPromptArtifactState,
    invalidateConversationSnapshotRequests,
  ]);

  const turns = useMemo(
    () => {
      const persistedTurns = session?.turns ?? [];
      const nextTurnIds = new Set(persistedTurns.map((turn) => turn.id));
      for (const turnId of uiTurnCacheRef.current.keys()) {
        if (!nextTurnIds.has(turnId)) {
          uiTurnCacheRef.current.delete(turnId);
        }
      }

      return persistedTurns.map((turn) =>
        getCachedUiTurn(
          turn,
          (session?.runs ?? []).filter((entry) => entry.turnId === turn.id),
          runtimeResults[turn.id],
          Boolean(savingTurnIds[turn.id]),
          promptArtifacts[turn.id]
        )
      );
    },
    [getCachedUiTurn, promptArtifacts, runtimeResults, savingTurnIds, session?.runs, session?.turns]
  );

  const aspectRatioOptions = useMemo<ImageAspectRatio[]>(
    () => modelConfig?.constraints.supportedAspectRatios ?? ["1:1"],
    [modelConfig?.constraints.supportedAspectRatios]
  );

  const isGenerating = useMemo(
    () => (session?.turns ?? []).some((turn) => turn.status === "loading"),
    [session?.turns]
  );

  return {
    turns,
    notice,
    isGenerating,
    isCatalogLoading,
    catalogError,
    promptObservabilityStatus: promptObservability?.status ?? "idle",
    promptObservabilityError: promptObservability?.error ?? null,
    promptObservability: promptObservability?.summary ?? null,
    config,
    models,
    providers,
    styles,
    modelConfig,
    modelParamDefinitions,
    supportedFeatures,
    aspectRatioOptions,
    setModel,
    updateConfig,
    addReferenceFiles,
    updateReferenceImage: patchReferenceImage,
    removeReferenceImage,
    clearReferenceImages,
    removeAssetReference,
    updateAssetRefRole,
    clearAssetReferences,
    useResultAsReference,
    editFromResult,
    varyFromResult,
    loadPromptArtifacts,
    loadPromptObservability,
    generateFromPromptInput,
    deleteTurn,
    acceptTurnResult,
    retryTurn,
    reuseParameters,
    upscaleResult,
    toggleResultSelection,
    saveSelectedResults,
    addToCanvas,
    clearSession,
  };
}
