import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { importAssetFiles } from "@/lib/assetImport";
import { generateImage as requestImageGeneration } from "@/lib/ai/imageGeneration";
import { getImageProviderConfig } from "@/lib/ai/imageProviders";
import type { Asset, CanvasImageElement } from "@/types";
import type {
  GeneratedImage,
  ImageGenerationRequest,
  ReferenceImage,
} from "@/types/imageGeneration";
import { useAssetStore } from "@/stores/assetStore";
import type { GenerationConfig } from "@/stores/generationConfigStore";
import { useCanvasStore } from "@/stores/canvasStore";
import { useGenerationConfig } from "./useGenerationConfig";

export interface GeneratedResultItem extends GeneratedImage {
  index: number;
  assetId: string | null;
  selected: boolean;
  saved: boolean;
}

export interface ImageGenerationTurn {
  id: string;
  prompt: string;
  createdAt: string;
  configSnapshot: GenerationConfig;
  status: "loading" | "done" | "error";
  error: string | null;
  isSavingSelection: boolean;
  results: GeneratedResultItem[];
}

interface ImageGenerationState {
  turns: ImageGenerationTurn[];
}

interface ImportedImage {
  imageUrl: string;
  assetId: string | null;
  provider: GeneratedImage["provider"];
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

const cloneGenerationConfig = (config: GenerationConfig): GenerationConfig => ({
  ...config,
  referenceImages: config.referenceImages.map((entry) => ({ ...entry })),
  modelParams: { ...config.modelParams },
});

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
  const entries = await Promise.all(files.map((file) => toReferenceImageEntry(file, type, options)));
  return entries;
};

const toImageRequest = (
  prompt: string,
  config: GenerationConfig,
  supportedFeatures: {
    negativePrompt: boolean;
    referenceImages: {
      enabled: boolean;
    };
    seed: boolean;
    guidanceScale: boolean;
    steps: boolean;
    styles: boolean;
  },
  options?: { supportsCustomSize?: boolean }
): ImageGenerationRequest => ({
  prompt,
  provider: config.provider,
  model: config.model,
  aspectRatio: config.aspectRatio,
  width: options?.supportsCustomSize ? config.width ?? undefined : undefined,
  height: options?.supportsCustomSize ? config.height ?? undefined : undefined,
  style: supportedFeatures.styles ? config.style : "none",
  stylePreset: config.stylePreset || undefined,
  negativePrompt: supportedFeatures.negativePrompt ? config.negativePrompt || undefined : undefined,
  referenceImages: supportedFeatures.referenceImages.enabled ? config.referenceImages : [],
  seed: supportedFeatures.seed ? config.seed ?? undefined : undefined,
  guidanceScale: supportedFeatures.guidanceScale ? config.guidanceScale ?? undefined : undefined,
  steps: supportedFeatures.steps ? config.steps ?? undefined : undefined,
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
      height: Math.max(
        96,
        Math.round((DEFAULT_CANVAS_LONG_EDGE * sourceHeight) / sourceWidth)
      ),
    };
  }

  return {
    width: Math.max(
      96,
      Math.round((DEFAULT_CANVAS_LONG_EDGE * sourceWidth) / sourceHeight)
    ),
    height: DEFAULT_CANVAS_LONG_EDGE,
  };
};

const applyImportedAssetsToResults = (
  results: GeneratedResultItem[],
  indexToAssetId: Record<number, string>,
  options?: { deselectImported?: boolean }
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
      selected: options?.deselectImported !== false ? false : result.selected,
    };
  });

const toUploadFiles = async (images: Array<{ image: GeneratedImage; index: number }>) =>
  Promise.all(
    images.map(async ({ image, index }) => {
      const imageResponse = await fetch(image.imageUrl);
      if (!imageResponse.ok) {
        throw new Error("Generated image could not be downloaded.");
      }
      const blob = await imageResponse.blob();
      const mimeType = blob.type || image.mimeType || "image/png";
      const extension = blobToFileExtension(mimeType);
      const file = new File([blob], `ai-${Date.now()}-${index}.${extension}`, {
        type: mimeType,
      });
      return file;
    })
  );

const updateTurnInList = (
  turns: ImageGenerationTurn[],
  turnId: string,
  updater: (turn: ImageGenerationTurn) => ImageGenerationTurn
) => turns.map((turn) => (turn.id === turnId ? updater(turn) : turn));

const toGeneratedResultItems = (images: GeneratedImage[]): GeneratedResultItem[] =>
  images.map((image, index) => ({
    ...image,
    index,
    assetId: null,
    selected: true,
    saved: false,
  }));

export async function generateImages(
  request: ImageGenerationRequest,
  options?: { signal?: AbortSignal }
): Promise<GeneratedImage[]> {
  const generated = await requestImageGeneration(request, options);
  return generated.images;
}

export async function saveGeneratedImages(
  images: GeneratedImage[],
  selectedIndexes: number[]
): Promise<ImportedGenerationResult> {
  const selectedEntries = selectedIndexes
    .map((index) => ({ image: images[index], index }))
    .filter((entry): entry is { image: GeneratedImage; index: number } => Boolean(entry.image));

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
  if (importedAssetIds[0]) {
    useAssetStore.getState().setSelectedAssetIds([importedAssetIds[0]]);
  }

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

export async function generateAndImportImage(
  request: ImageGenerationRequest,
  options?: { signal?: AbortSignal }
): Promise<ImportedGenerationResult> {
  const generatedImages = await generateImages(request, options);
  const selectedIndexes = generatedImages.map((_, index) => index);
  return saveGeneratedImages(generatedImages, selectedIndexes);
}

export function useImageGeneration() {
  const {
    config,
    providers,
    styles,
    providerConfig,
    modelConfig,
    modelParamDefinitions,
    setProvider,
    setModel,
    updateConfig,
    addReferenceImages,
    updateReferenceImage,
    removeReferenceImage,
    clearReferenceImages,
  } = useGenerationConfig();

  const [state, setState] = useState<ImageGenerationState>({
    turns: [],
  });
  const generationRequestRef = useRef<{
    controller: AbortController;
    turnId: string;
  } | null>(null);

  const supportedFeatures = providerConfig.supportedFeatures;

  useEffect(() => {
    return () => {
      generationRequestRef.current?.controller.abort();
      generationRequestRef.current = null;
    };
  }, []);

  const saveSelectedResults = useCallback(
    async (turnId: string) => {
      const turn = state.turns.find((entry) => entry.id === turnId);
      if (!turn) {
        return null;
      }

      const selectedIndexes = turn.results
        .filter((entry) => entry.selected && !entry.saved)
        .map((entry) => entry.index);
      if (selectedIndexes.length === 0) {
        return null;
      }

      setState((previous) => ({
        turns: updateTurnInList(previous.turns, turnId, (entry) => ({
          ...entry,
          isSavingSelection: true,
          error: null,
        })),
      }));

      try {
        const generatedImages = turn.results.map((entry) => ({
          imageUrl: entry.imageUrl,
          provider: entry.provider,
          model: entry.model,
          mimeType: entry.mimeType,
          revisedPrompt: entry.revisedPrompt,
        }));

        const imported = await saveGeneratedImages(generatedImages, selectedIndexes);

        setState((previous) => ({
          turns: updateTurnInList(previous.turns, turnId, (entry) => ({
            ...entry,
            isSavingSelection: false,
            error: null,
            results: entry.results.map((result) => {
              const assetId = imported.indexToAssetId[result.index];
              if (!assetId) {
                return result;
              }
              return {
                ...result,
                assetId,
                saved: true,
                selected: false,
              };
            }),
          })),
        }));

        return imported;
      } catch (error) {
        setState((previous) => ({
          turns: updateTurnInList(previous.turns, turnId, (entry) => ({
            ...entry,
            isSavingSelection: false,
            error: error instanceof Error ? error.message : "Save generated images failed.",
          })),
        }));
        return null;
      }
    },
    [state.turns]
  );

  const toggleResultSelection = useCallback((turnId: string, index: number) => {
    setState((previous) => ({
      turns: updateTurnInList(previous.turns, turnId, (turn) => ({
        ...turn,
        results: turn.results.map((entry) =>
          entry.index === index && !entry.saved
            ? {
                ...entry,
                selected: !entry.selected,
              }
            : entry
        ),
      })),
    }));
  }, []);

  const addReferenceFiles = useCallback(
    async (filesInput: FileList | File[]) => {
      const entries = await filesToReferenceImages(filesInput, "content", {
        maxFileSizeBytes: providerConfig.supportedFeatures.referenceImages.maxFileSizeBytes,
      });
      addReferenceImages(entries);
      return entries;
    },
    [addReferenceImages, providerConfig.supportedFeatures.referenceImages.maxFileSizeBytes]
  );

  const generateFromPromptInput = useCallback(
    async (input: { text: string }) => {
      const prompt = input.text.trim();
      if (!prompt) {
        return null;
      }

      if (generationRequestRef.current) {
        const { controller, turnId } = generationRequestRef.current;
        controller.abort();
        setState((previous) => ({
          turns: updateTurnInList(previous.turns, turnId, (turn) =>
            turn.status === "loading"
              ? {
                  ...turn,
                  status: "error",
                  error: "Generation canceled by a newer request.",
                }
              : turn
          ),
        }));
      }

      const turnId = createTurnId();
      const configSnapshot = cloneGenerationConfig(config);
      const requestProviderConfig = getImageProviderConfig(configSnapshot.provider);
      const requestSupportedFeatures =
        requestProviderConfig?.supportedFeatures ?? supportedFeatures;
      const controller = new AbortController();

      generationRequestRef.current = {
        controller,
        turnId,
      };

      setState((previous) => ({
        turns: [
          {
            id: turnId,
            prompt,
            createdAt: new Date().toISOString(),
            configSnapshot,
            status: "loading",
            error: null,
            isSavingSelection: false,
            results: [],
          },
          ...previous.turns,
        ],
      }));

      try {
        const images = await generateImages(
          toImageRequest(prompt, configSnapshot, requestSupportedFeatures, {
            supportsCustomSize: Boolean(modelConfig.supportsCustomSize),
          }),
          {
            signal: controller.signal,
          }
        );
        
        if (
          generationRequestRef.current?.controller !== controller ||
          generationRequestRef.current?.turnId !== turnId
        ) {
          return null;
        }

        setState((previous) => ({
          turns: updateTurnInList(previous.turns, turnId, (turn) => ({
            ...turn,
            status: "done",
            error: null,
            results: toGeneratedResultItems(images),
          })),
        }));

        return images;
      } catch (error) {
        if (controller.signal.aborted) {
          return null;
        }

        setState((previous) => ({
          turns: updateTurnInList(previous.turns, turnId, (turn) => ({
            ...turn,
            status: "error",
            results: [],
            error: error instanceof Error ? error.message : "Image generation failed.",
          })),
        }));
        return null;
      } finally {
        if (
          generationRequestRef.current?.controller === controller &&
          generationRequestRef.current?.turnId === turnId
        ) {
          generationRequestRef.current = null;
        }
      }
    },
    [config, modelConfig.supportsCustomSize, supportedFeatures]
  );

  const addToCanvas = useCallback(
    async (turnId: string, index?: number, assetId?: string | null) => {
      const turn = state.turns.find((entry) => entry.id === turnId);
      if (!turn) {
        return null;
      }

      let finalAssetId =
        assetId ??
        (typeof index === "number"
          ? turn.results.find((entry) => entry.index === index)?.assetId ?? null
          : turn.results.find((entry) => entry.assetId)?.assetId ?? null);
      if (!finalAssetId && typeof index === "number") {
        const generatedImages = turn.results.map((entry) => ({
          imageUrl: entry.imageUrl,
          provider: entry.provider,
          model: entry.model,
          mimeType: entry.mimeType,
          revisedPrompt: entry.revisedPrompt,
        }));
        const imported = await saveGeneratedImages(generatedImages, [index]);
        finalAssetId = imported.indexToAssetId[index] ?? null;

        if (finalAssetId) {
          setState((previous) => ({
            turns: updateTurnInList(previous.turns, turnId, (entry) => ({
              ...entry,
              results: applyImportedAssetsToResults(entry.results, imported.indexToAssetId),
            })),
          }));
        }
      }
      if (!finalAssetId) {
        return null;
      }

      const canvas = useCanvasStore.getState();
      const asset = useAssetStore
        .getState()
        .assets.find((entry) => entry.id === finalAssetId);
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
    [state.turns]
  );

  const aspectRatioOptions = useMemo(
    () => modelConfig.supportedAspectRatios,
    [modelConfig.supportedAspectRatios]
  );

  const isGenerating = useMemo(
    () => state.turns.some((turn) => turn.status === "loading"),
    [state.turns]
  );

  return {
    turns: state.turns,
    isGenerating,
    config,
    providers,
    styles,
    providerConfig,
    modelConfig,
    modelParamDefinitions,
    supportedFeatures,
    aspectRatioOptions,
    setProvider,
    setModel,
    updateConfig,
    addReferenceFiles,
    updateReferenceImage,
    removeReferenceImage,
    clearReferenceImages,
    generateFromPromptInput,
    toggleResultSelection,
    saveSelectedResults,
    addToCanvas,
  };
}
