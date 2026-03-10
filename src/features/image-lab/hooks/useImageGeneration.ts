import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  GenerationJobSnapshot,
  PersistedImageGenerationRequestSnapshot,
  PersistedGenerationTurn,
  PersistedResultItem,
} from "../../../../shared/chatImageTypes";
import type { FrontendImageModelId } from "../../../../shared/imageModelCatalog";
import { importAssetFiles } from "@/lib/assetImport";
import type { ImageModelParamValue } from "@/lib/ai/imageModelParams";
import { generateImage as requestImageGeneration } from "@/lib/ai/imageGeneration";
import {
  getImageModelCatalogEntry,
  getRuntimeProviderEntry,
  toCatalogFeatureSupport,
  type CatalogDrivenFeatureSupport,
  type ImageModelCatalog,
} from "@/lib/ai/imageModelCatalog";
import type { Asset, CanvasImageElement } from "@/types";
import type {
  GeneratedImage,
  ImageAspectRatio,
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
} from "@/types/imageGeneration";
import { useAssetStore } from "@/stores/assetStore";
import {
  sanitizeGenerationConfig,
  type GenerationConfig,
} from "@/stores/generationConfigStore";
import { useCanvasStore } from "@/stores/canvasStore";
import { useImageSessionStore } from "@/stores/imageSessionStore";
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
  status: "loading" | "done" | "error";
  error: string | null;
  warnings: string[];
  isSavingSelection: boolean;
  results: GeneratedResultItem[];
}

interface ImportedImage {
  imageUrl: string;
  assetId: string | null;
  provider: string;
  model: string;
  index: number;
  mimeType?: string;
  revisedPrompt?: string | null;
}

interface ImportedGenerationResult {
  imageUrl: string;
  assetId: string | null;
  images: ImportedImage[];
  importedAssetIds: string[];
  indexToAssetId: Record<number, string>;
}

interface RuntimeResultState {
  selected?: boolean;
  isUpscaling?: boolean;
  upscaleError?: string | null;
}

type RuntimeResultStateMap = Record<string, Record<number, RuntimeResultState>>;

const createElementId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `canvas-image-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
};

const createTurnId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `generated-turn-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
};

const createJobId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `image-job-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
};

export const RETRY_REFERENCE_IMAGES_OMITTED_WARNING =
  "Reference images from history are no longer available and were omitted. This retry will run without them, so re-upload the reference images if you need the same result.";

const cloneGenerationConfig = (config: GenerationConfig): GenerationConfig => ({
  ...config,
  referenceImages: config.referenceImages.map((entry) => ({ ...entry })),
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
  referenceImages: [],
  seed: null,
  guidanceScale: null,
  steps: null,
  sampler: "",
  batchSize: 1,
  modelParams: {},
});

const serializeConfig = (config: GenerationConfig): Record<string, unknown> => ({
  ...config,
  referenceImages: config.referenceImages.map(({ id, fileName, type, weight }) => ({
    id,
    fileName,
    type,
    weight,
  })),
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
      url: "",
      fileName: typeof entry.fileName === "string" ? entry.fileName : undefined,
      type: isReferenceImageType(entry.type) ? entry.type : "content",
      weight: typeof entry.weight === "number" ? entry.weight : 1,
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
    referenceImages: deserializeReferenceImages(snapshot.referenceImages),
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
  modelId: FrontendImageModelId | string
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
    referenceImages: snapshot.referenceImages.map(({ id, fileName, type, weight }) => ({
      id,
      fileName,
      type,
      weight,
    })),
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

const toPersistedResults = (images: GeneratedImage[]): PersistedResultItem[] =>
  images.map((image, index) => ({
    imageUrl: image.imageUrl,
    imageId: image.imageId ?? null,
    runtimeProvider: image.provider,
    providerModel: image.model,
    mimeType: image.mimeType,
    revisedPrompt: image.revisedPrompt ?? null,
    index,
    assetId: null,
    saved: false,
  }));

interface SaveableGeneratedImage {
  imageUrl: string;
  imageId?: string | null;
  provider: string;
  model: string;
  mimeType?: string;
  revisedPrompt?: string | null;
}

const toGeneratedImages = (
  results: Array<{
    imageUrl: string;
    imageId?: string | null;
    provider: string;
    model: string;
    mimeType?: string;
    revisedPrompt?: string | null;
  }>
): SaveableGeneratedImage[] =>
  results.map((result) => ({
    imageUrl: result.imageUrl,
    imageId: result.imageId ?? undefined,
    provider: result.provider,
    model: result.model,
    mimeType: result.mimeType,
    revisedPrompt: result.revisedPrompt ?? null,
  }));

const applyImportedAssetsToPersistedResults = (
  results: PersistedResultItem[],
  indexToAssetId: Record<number, string>
) =>
  results.map((result) => {
    const assetId = indexToAssetId[result.index];
    if (!assetId) {
      return result;
    }

    return {
      ...result,
      assetId,
      saved: true,
    };
  });

const toUITurn = (
  turn: PersistedGenerationTurn,
  runtimeResults: Record<number, RuntimeResultState> | undefined,
  isSavingSelection: boolean,
  catalog: ImageModelCatalog | null | undefined
): ImageGenerationTurn => {
  const displayMeta = resolveSnapshotDisplayMeta(turn.configSnapshot, catalog);
  const runtimeProviderLabel =
    getRuntimeProviderEntry(catalog, turn.runtimeProvider)?.name ?? turn.runtimeProvider;

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
    status: turn.status,
    error: turn.error,
    warnings: turn.warnings,
    isSavingSelection,
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
        assetId: result.assetId,
        selected: runtimeState?.selected ?? !result.saved,
        saved: result.saved,
        isUpscaling: runtimeState?.isUpscaling ?? false,
        upscaleError: runtimeState?.upscaleError ?? null,
      };
    }),
  };
};

const REFERENCE_IMAGE_MAX_DIMENSION = 1_600;
const DEFAULT_CANVAS_LONG_EDGE = 420;

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
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `ref-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
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

const toImageRequest = (
  prompt: string,
  config: GenerationConfig,
  supportedFeatures: CatalogDrivenFeatureSupport,
  options?: { supportsCustomSize?: boolean }
): ImageGenerationRequest => ({
  prompt,
  modelId: config.modelId,
  aspectRatio: config.aspectRatio,
  width: options?.supportsCustomSize ? (config.width ?? undefined) : undefined,
  height: options?.supportsCustomSize ? (config.height ?? undefined) : undefined,
  style: supportedFeatures.styles ? config.style : "none",
  stylePreset: config.stylePreset || undefined,
  negativePrompt: supportedFeatures.negativePrompt ? config.negativePrompt || undefined : undefined,
  referenceImages: supportedFeatures.referenceImages.enabled ? config.referenceImages : [],
  seed: supportedFeatures.seed ? (config.seed ?? undefined) : undefined,
  guidanceScale: supportedFeatures.guidanceScale ? (config.guidanceScale ?? undefined) : undefined,
  steps: supportedFeatures.steps ? (config.steps ?? undefined) : undefined,
  sampler: config.sampler || undefined,
  batchSize: config.batchSize,
  modelParams: config.modelParams,
});

export const resolveCanvasImageSize = (asset?: Asset | null) => {
  const sourceWidth = asset?.metadata?.width ?? 0;
  const sourceHeight = asset?.metadata?.height ?? 0;
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return {
      width: DEFAULT_CANVAS_LONG_EDGE,
      height: DEFAULT_CANVAS_LONG_EDGE,
    };
  }

  if (sourceWidth >= sourceHeight) {
    return {
      width: DEFAULT_CANVAS_LONG_EDGE,
      height: Math.max(96, Math.round((DEFAULT_CANVAS_LONG_EDGE * sourceHeight) / sourceWidth)),
    };
  }

  return {
    width: Math.max(96, Math.round((DEFAULT_CANVAS_LONG_EDGE * sourceWidth) / sourceHeight)),
    height: DEFAULT_CANVAS_LONG_EDGE,
  };
};

const toUploadFiles = async (images: Array<{ image: SaveableGeneratedImage; index: number }>) =>
  Promise.all(
    images.map(async ({ image, index }) => {
      const imageResponse = await fetch(image.imageUrl);
      if (!imageResponse.ok) {
        throw new Error("Generated image could not be downloaded.");
      }
      const blob = await imageResponse.blob();
      const mimeType = blob.type || image.mimeType || "image/png";
      const extension = blobToFileExtension(mimeType);
      return new File([blob], `ai-${Date.now()}-${index}.${extension}`, {
        type: mimeType,
      });
    })
  );

export async function generateImages(
  request: ImageGenerationRequest,
  options?: { signal?: AbortSignal }
): Promise<ImageGenerationResponse> {
  return requestImageGeneration(request, options);
}

export async function saveGeneratedImages(
  images: SaveableGeneratedImage[],
  selectedIndexes: number[]
): Promise<ImportedGenerationResult> {
  const selectedEntries = selectedIndexes
    .map((index) => ({ image: images[index], index }))
    .filter(
      (entry): entry is { image: SaveableGeneratedImage; index: number } => Boolean(entry.image)
    );

  if (selectedEntries.length === 0) {
    return {
      imageUrl: "",
      assetId: null,
      images: [],
      importedAssetIds: [],
      indexToAssetId: {},
    };
  }

  const files = await toUploadFiles(selectedEntries);
  const importResult = await importAssetFiles(files, {
    source: "ai-generated",
    origin: "ai",
  });

  const importedAssetIds = importResult.resolvedAssetIds;
  const indexToAssetId: Record<number, string> = {};
  const importedImages = selectedEntries.map((entry, arrayIndex) => {
    const assetId = importedAssetIds[arrayIndex] ?? null;
    if (assetId) {
      indexToAssetId[entry.index] = assetId;
    }
    return {
      ...entry.image,
      index: entry.index,
      assetId,
    };
  });

  return {
    imageUrl: importedImages[0]?.imageUrl ?? "",
    assetId: importedImages[0]?.assetId ?? null,
    images: importedImages,
    importedAssetIds,
    indexToAssetId,
  };
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
    setModel,
    updateConfig,
    addReferenceImages,
    updateReferenceImage,
    removeReferenceImage,
    clearReferenceImages,
  } = useGenerationConfig();
  const session = useImageSessionStore((state) => state.session);
  const addTurnWithJob = useImageSessionStore((state) => state.addTurnWithJob);
  const updateTurn = useImageSessionStore((state) => state.updateTurn);
  const deleteTurnFromStore = useImageSessionStore((state) => state.deleteTurn);
  const updateJob = useImageSessionStore((state) => state.updateJob);
  const clearPersistedSession = useImageSessionStore((state) => state.clearSession);

  const [savingTurnIds, setSavingTurnIds] = useState<Record<string, boolean>>({});
  const [runtimeResults, setRuntimeResults] = useState<RuntimeResultStateMap>({});
  const sessionRef = useRef(session);
  const savingTurnIdsRef = useRef(savingTurnIds);
  const runtimeResultsRef = useRef(runtimeResults);
  const uiTurnCacheRef = useRef(
    new Map<
      string,
      {
        turn: PersistedGenerationTurn;
        runtimeResults: Record<number, RuntimeResultState> | undefined;
        isSavingSelection: boolean;
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

  useEffect(() => {
    return () => {
      generationRequestRef.current?.controller.abort();
      generationRequestRef.current = null;
    };
  }, []);

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

  const clearRuntimeResultState = useCallback((turnId: string, index: number) => {
    setRuntimeResults((previous) => {
      const turnState = previous[turnId];
      if (!turnState || !(index in turnState)) {
        return previous;
      }

      const nextTurnState = { ...turnState };
      delete nextTurnState[index];

      if (Object.keys(nextTurnState).length === 0) {
        const next = { ...previous };
        delete next[turnId];
        return next;
      }

      return {
        ...previous,
        [turnId]: nextTurnState,
      };
    });
  }, []);

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

  const getTurnById = useCallback(
    (turnId: string) => sessionRef.current?.turns.find((entry) => entry.id === turnId) ?? null,
    []
  );

  const getCachedUiTurn = useCallback(
    (
      turn: PersistedGenerationTurn,
      runtimeState: Record<number, RuntimeResultState> | undefined,
      isSavingSelection: boolean
    ) => {
      const cached = uiTurnCacheRef.current.get(turn.id);
      if (
        cached &&
        cached.turn === turn &&
        cached.runtimeResults === runtimeState &&
        cached.isSavingSelection === isSavingSelection
      ) {
        return cached.uiTurn;
      }

      const uiTurn = toUITurn(turn, runtimeState, isSavingSelection, catalog);
      uiTurnCacheRef.current.set(turn.id, {
        turn,
        runtimeResults: runtimeState,
        isSavingSelection,
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

      return getCachedUiTurn(
        turn,
        runtimeResultsRef.current[turnId],
        Boolean(savingTurnIdsRef.current[turnId])
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

  const persistImportedAssets = useCallback(
    (turnId: string, indexToAssetId: Record<number, string>) => {
      const nextResults = updateTurnResults(turnId, (results) =>
        applyImportedAssetsToPersistedResults(results, indexToAssetId)
      );
      if (!nextResults) {
        return;
      }

      Object.keys(indexToAssetId).forEach((indexKey) => {
        clearRuntimeResultState(turnId, Number(indexKey));
      });
      updateTurn(turnId, {
        error: null,
      });
    },
    [clearRuntimeResultState, updateTurn, updateTurnResults]
  );

  const addReferenceFiles = useCallback(
    async (filesInput: FileList | File[]) => {
      const entries = await filesToReferenceImages(filesInput, "content", {
        maxFileSizeBytes: supportedFeatures.referenceImages.maxFileSizeBytes,
      });
      addReferenceImages(entries);
      return entries;
    },
    [addReferenceImages, supportedFeatures.referenceImages.maxFileSizeBytes]
  );

  const runGeneration = useCallback(
    async (options: {
      prompt: string;
      configSnapshot: GenerationConfig;
      requestSnapshot: ImageGenerationRequest;
      replaceTurnId?: string;
      localWarnings?: string[];
    }) => {
      if (!sessionRef.current) {
        return null;
      }

      const prompt = options.prompt.trim();
      if (!prompt) {
        return null;
      }
      const requestModel =
        getImageModelCatalogEntry(catalog, options.requestSnapshot.modelId) ?? modelConfig;

      cancelActiveGeneration("Generation canceled by a newer request.");

      const turnId = createTurnId();
      const jobId = createJobId();
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
          modelId: options.requestSnapshot.modelId,
          logicalModel: requestModel?.logicalModel ?? "image.seedream.v5",
          deploymentId: requestModel?.deploymentId ?? "ark-seedream-v5-primary",
          runtimeProvider: requestModel?.primaryProvider ?? "ark",
          providerModel: requestModel?.providerModel ?? "doubao-seedream-5-0-260128",
          configSnapshot: serializeConfig(cloneGenerationConfig(options.configSnapshot)),
          status: "loading",
          error: null,
          warnings: options.localWarnings ?? [],
          jobId,
          results: [],
        },
        {
          id: jobId,
          turnId,
          modelId: options.requestSnapshot.modelId,
          logicalModel: requestModel?.logicalModel ?? "image.seedream.v5",
          deploymentId: requestModel?.deploymentId ?? "ark-seedream-v5-primary",
          runtimeProvider: requestModel?.primaryProvider ?? "ark",
          providerModel: requestModel?.providerModel ?? "doubao-seedream-5-0-260128",
          compiledPrompt: prompt,
          requestSnapshot: toPersistedRequestSnapshot(options.requestSnapshot),
          status: "running",
          error: null,
          createdAt,
          completedAt: null,
        }
      );

      if (options.replaceTurnId) {
        uiTurnCacheRef.current.delete(options.replaceTurnId);
        clearRuntimeTurnState(options.replaceTurnId);
        deleteTurnFromStore(options.replaceTurnId);
      }

      try {
        const generated = await generateImages(options.requestSnapshot, {
          signal: controller.signal,
        });

        if (
          generationRequestRef.current?.controller !== controller ||
          generationRequestRef.current?.turnId !== turnId ||
          generationRequestRef.current?.jobId !== jobId
        ) {
          return null;
        }

        updateTurn(turnId, {
          logicalModel: generated.logicalModel,
          deploymentId: generated.deploymentId,
          runtimeProvider: generated.runtimeProvider,
          providerModel: generated.providerModel,
          status: "done",
          error: null,
          warnings: [...(options.localWarnings ?? []), ...(generated.warnings ?? [])],
          results: toPersistedResults(generated.images),
        });
        updateJob(jobId, {
          status: "succeeded",
          error: null,
          completedAt: new Date().toISOString(),
        });

        return generated.images;
      } catch (error) {
        if (controller.signal.aborted) {
          return null;
        }

        const errorMessage =
          error instanceof Error ? error.message : "Image generation failed.";

        updateTurn(turnId, {
          status: "error",
          results: [],
          error: errorMessage,
          warnings: options.localWarnings ?? [],
        });
        updateJob(jobId, {
          status: "failed",
          error: errorMessage,
          completedAt: new Date().toISOString(),
        });
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
      clearRuntimeTurnState,
      deleteTurnFromStore,
      modelConfig,
      updateJob,
      updateTurn,
    ]
  );

  const generateWithConfig = useCallback(
    async (
      promptInput: string,
      configSnapshot: GenerationConfig,
      options?: { replaceTurnId?: string }
    ) => {
      const prompt = promptInput.trim();
      if (!prompt || !catalog) {
        return null;
      }

      const nextConfigSnapshot = cloneGenerationConfig(configSnapshot);
      const requestModelConfig = getImageModelCatalogEntry(catalog, nextConfigSnapshot.modelId);
      const requestSupportedFeatures = toCatalogFeatureSupport(requestModelConfig);

      return runGeneration({
        prompt,
        configSnapshot: nextConfigSnapshot,
        requestSnapshot: toImageRequest(prompt, nextConfigSnapshot, requestSupportedFeatures, {
          supportsCustomSize: Boolean(requestModelConfig?.constraints.supportsCustomSize),
        }),
        replaceTurnId: options?.replaceTurnId,
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
        replaceTurnId: originalTurn.id,
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
    (turnId: string) => {
      if (generationRequestRef.current?.turnId === turnId) {
        generationRequestRef.current.controller.abort();
        generationRequestRef.current = null;
      }

      uiTurnCacheRef.current.delete(turnId);
      clearRuntimeTurnState(turnId);
      deleteTurnFromStore(turnId);
    },
    [clearRuntimeTurnState, deleteTurnFromStore]
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

      return generateWithConfig(turn.prompt, deserializeConfig(turn.configSnapshot, catalog), {
        replaceTurnId: turn.id,
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
        const imported = await saveGeneratedImages(toGeneratedImages(turn.results), selectedIndexes);
        persistImportedAssets(turnId, imported.indexToAssetId);
        return imported;
      } catch (error) {
        updateTurn(turnId, {
          error: error instanceof Error ? error.message : "Save generated images failed.",
        });
        return null;
      } finally {
        setTurnSavingState(turnId, false);
      }
    },
    [getUiTurnById, persistImportedAssets, setTurnSavingState, updateTurn]
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

      let finalAssetId =
        assetId ??
        (typeof index === "number"
          ? (turn.results.find((entry) => entry.index === index)?.assetId ?? null)
          : (turn.results.find((entry) => entry.assetId)?.assetId ?? null));
      if (!finalAssetId && typeof index === "number") {
        const imported = await saveGeneratedImages(toGeneratedImages(turn.results), [index]);
        finalAssetId = imported.indexToAssetId[index] ?? null;

        if (finalAssetId) {
          persistImportedAssets(turnId, imported.indexToAssetId);
        }
      }
      if (!finalAssetId) {
        return null;
      }

      const canvas = useCanvasStore.getState();
      const asset = useAssetStore.getState().assets.find((entry) => entry.id === finalAssetId);
      let documentId = canvas.activeDocumentId;
      if (!documentId) {
        const created = await canvas.createDocument("AI Board");
        documentId = created.id;
      }
      if (!documentId) {
        return null;
      }

      const { width, height } = resolveCanvasImageSize(asset);
      const document = canvas.documents.find((item) => item.id === documentId);
      const zIndex = (document?.elements.length ?? 0) + 1;

      const element: CanvasImageElement = {
        id: createElementId(),
        type: "image",
        assetId: finalAssetId,
        x: 140 + zIndex * 24,
        y: 120 + zIndex * 24,
        width,
        height,
        rotation: 0,
        opacity: 1,
        locked: false,
        visible: true,
        zIndex,
      };

      await canvas.upsertElement(documentId, element);
      canvas.setSelectedElementIds([element.id]);
      return { documentId, elementId: element.id };
    },
    [getUiTurnById, persistImportedAssets]
  );

  const clearSession = useCallback(() => {
    generationRequestRef.current?.controller.abort();
    generationRequestRef.current = null;
    uiTurnCacheRef.current.clear();
    setSavingTurnIds({});
    setRuntimeResults({});
    clearPersistedSession();
  }, [clearPersistedSession]);

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
        getCachedUiTurn(turn, runtimeResults[turn.id], Boolean(savingTurnIds[turn.id]))
      );
    },
    [catalog, getCachedUiTurn, runtimeResults, savingTurnIds, session?.turns]
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
    isGenerating,
    isCatalogLoading,
    catalogError,
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
    updateReferenceImage,
    removeReferenceImage,
    clearReferenceImages,
    generateFromPromptInput,
    deleteTurn,
    retryTurn,
    reuseParameters,
    upscaleResult,
    toggleResultSelection,
    saveSelectedResults,
    addToCanvas,
    clearSession,
  };
}
