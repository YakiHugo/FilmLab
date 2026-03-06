import { useCallback, useMemo, useState } from "react";
import { generateImage as requestImageGeneration } from "@/lib/ai/imageGeneration";
import { importAssetFiles } from "@/lib/assetImport";
import type { GenerationConfig } from "@/stores/generationConfigStore";
import type {
  GeneratedImage,
  ImageGenerationRequest,
  ReferenceImage,
} from "@/types/imageGeneration";
import type { CanvasImageElement } from "@/types";
import { useAssetStore } from "@/stores/assetStore";
import { useCanvasStore } from "@/stores/canvasStore";
import { useGenerationConfig } from "./useGenerationConfig";

interface GeneratedResultItem extends GeneratedImage {
  index: number;
  assetId: string | null;
  selected: boolean;
  saved: boolean;
}

interface ImageGenerationState {
  status: "idle" | "loading" | "done" | "error";
  error: string | null;
  prompt: string;
  isSavingSelection: boolean;
  resultBatchId: string | null;
  results: GeneratedResultItem[];
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

const createResultBatchId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `generated-batch-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
};

const blobToFileExtension = (mimeType: string) =>
  mimeType.includes("jpeg") ? "jpg" : mimeType.includes("webp") ? "webp" : "png";

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string" || !reader.result) {
        reject(new Error(`Could not read reference image: ${file.name}`));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = () => reject(new Error(`Could not read reference image: ${file.name}`));
    reader.readAsDataURL(file);
  });

export const filesToReferenceImages = async (
  filesInput: FileList | File[],
  type: ReferenceImage["type"] = "content"
): Promise<ReferenceImage[]> => {
  const files = Array.isArray(filesInput) ? filesInput : Array.from(filesInput);
  const entries = await Promise.all(
    files.map(async (file) => ({
      id:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `ref-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      url: await readFileAsDataUrl(file),
      fileName: file.name,
      type,
      weight: 1,
    }))
  );
  return entries;
};

const toImageRequest = (
  prompt: string,
  config: GenerationConfig,
  supportedFeatures: {
    negativePrompt: boolean;
    referenceImages: boolean;
    seed: boolean;
    guidanceScale: boolean;
    steps: boolean;
    styles: boolean;
  }
): ImageGenerationRequest => ({
  prompt,
  provider: config.provider,
  model: config.model,
  aspectRatio: config.aspectRatio,
  width: config.width ?? undefined,
  height: config.height ?? undefined,
  style: supportedFeatures.styles ? config.style : "none",
  stylePreset: config.stylePreset || undefined,
  negativePrompt: supportedFeatures.negativePrompt ? config.negativePrompt || undefined : undefined,
  referenceImages: supportedFeatures.referenceImages ? config.referenceImages : [],
  seed: supportedFeatures.seed ? config.seed ?? undefined : undefined,
  guidanceScale: supportedFeatures.guidanceScale ? config.guidanceScale ?? undefined : undefined,
  steps: supportedFeatures.steps ? config.steps ?? undefined : undefined,
  sampler: config.sampler || undefined,
  batchSize: config.batchSize,
  modelParams: config.modelParams,
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

export async function generateImages(request: ImageGenerationRequest): Promise<GeneratedImage[]> {
  const generated = await requestImageGeneration(request);
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
  request: ImageGenerationRequest
): Promise<ImportedGenerationResult> {
  const generatedImages = await generateImages(request);
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
    status: "idle",
    error: null,
    prompt: "",
    isSavingSelection: false,
    resultBatchId: null,
    results: [],
  });

  const supportedFeatures = providerConfig.supportedFeatures;

  const setPrompt = useCallback((prompt: string) => {
    setState((previous) => ({ ...previous, prompt }));
  }, []);

  const runGeneration = useCallback(
    async (prompt: string, configForRequest: GenerationConfig) => {
      setState((previous) => ({
        ...previous,
        status: "loading",
        error: null,
        resultBatchId: null,
        results: [],
      }));

      try {
        const images = await generateImages(toImageRequest(prompt, configForRequest, supportedFeatures));
        setState((previous) => ({
          ...previous,
          status: "done",
          error: null,
          resultBatchId: createResultBatchId(),
          results: images.map((image, index) => ({
            ...image,
            index,
            assetId: null,
            selected: true,
            saved: false,
          })),
        }));
        return images;
      } catch (error) {
        setState((previous) => ({
          ...previous,
          status: "error",
          results: [],
          error: error instanceof Error ? error.message : "Image generation failed.",
        }));
        return null;
      }
    },
    [supportedFeatures]
  );

  const generate = useCallback(async () => {
    if (state.isSavingSelection) {
      return null;
    }
    const prompt = state.prompt.trim();
    if (!prompt) {
      setState((previous) => ({
        ...previous,
        status: "error",
        error: "Prompt is required.",
      }));
      return null;
    }

    return runGeneration(prompt, config);
  }, [config, runGeneration, state.isSavingSelection, state.prompt]);

  const saveSelectedResults = useCallback(async () => {
    const resultBatchId = state.resultBatchId;
    const selectedIndexes = state.results
      .filter((entry) => entry.selected && !entry.saved)
      .map((entry) => entry.index);
    if (!resultBatchId || selectedIndexes.length === 0) {
      return null;
    }

    setState((previous) => ({
      ...previous,
      isSavingSelection: true,
      error: null,
    }));

    try {
      const generatedImages = state.results.map((entry) => ({
        imageUrl: entry.imageUrl,
        provider: entry.provider,
        model: entry.model,
        mimeType: entry.mimeType,
        revisedPrompt: entry.revisedPrompt,
      }));

      const imported = await saveGeneratedImages(generatedImages, selectedIndexes);
      setState((previous) => ({
        ...previous,
        isSavingSelection: false,
        error: null,
        results:
          previous.resultBatchId !== resultBatchId
            ? previous.results
            : previous.results.map((entry) => {
                const assetId = imported.indexToAssetId[entry.index];
                if (!assetId) {
                  return entry;
                }
                return {
                  ...entry,
                  assetId,
                  saved: true,
                  selected: false,
                };
              }),
      }));
      return imported;
    } catch (error) {
      setState((previous) => ({
        ...previous,
        isSavingSelection: false,
        error: error instanceof Error ? error.message : "Save generated images failed.",
      }));
      return null;
    }
  }, [state.resultBatchId, state.results]);

  const toggleResultSelection = useCallback((index: number) => {
    setState((previous) => ({
      ...previous,
      results: previous.results.map((entry) =>
        entry.index === index && !entry.saved
          ? {
              ...entry,
              selected: !entry.selected,
            }
          : entry
      ),
    }));
  }, []);

  const addReferenceFiles = useCallback(
    async (filesInput: FileList | File[]) => {
      const entries = await filesToReferenceImages(filesInput);
      addReferenceImages(entries);
      return entries;
    },
    [addReferenceImages]
  );

  const generateFromChatInput = useCallback(
    async (input: { text: string; files?: FileList | null }) => {
      if (state.isSavingSelection) {
        return null;
      }
      const prompt = input.text.trim();
      if (!prompt) {
        setState((previous) => ({
          ...previous,
          status: "error",
          error: "Prompt is required for image generation.",
        }));
        return null;
      }

      let configForRequest = config;
      if (supportedFeatures.referenceImages && input.files && input.files.length > 0) {
        const entries = await filesToReferenceImages(input.files);
        addReferenceImages(entries);
        configForRequest = {
          ...configForRequest,
          referenceImages: [...config.referenceImages, ...entries].slice(0, 4),
        };
      }

      setState((previous) => ({
        ...previous,
        prompt,
      }));

      return runGeneration(prompt, configForRequest);
    },
    [addReferenceImages, config, runGeneration, state.isSavingSelection, supportedFeatures.referenceImages]
  );

  const addToCanvas = useCallback(
    async (assetId?: string | null) => {
      const finalAssetId =
        assetId ?? state.results.find((entry) => entry.assetId)?.assetId ?? null;
      if (!finalAssetId) {
        return null;
      }

      const canvas = useCanvasStore.getState();
      let documentId = canvas.activeDocumentId;
      if (!documentId) {
        const created = await canvas.createDocument("AI Board");
        documentId = created.id;
      }
      if (!documentId) {
        return null;
      }

      const document = canvas.documents.find((item) => item.id === documentId);
      const zIndex = (document?.elements.length ?? 0) + 1;

      const element: CanvasImageElement = {
        id: createElementId(),
        type: "image",
        assetId: finalAssetId,
        x: 140 + zIndex * 24,
        y: 120 + zIndex * 24,
        width: 420,
        height: 420,
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
    [state.results]
  );

  const aspectRatioOptions = useMemo(
    () => modelConfig.supportedAspectRatios,
    [modelConfig.supportedAspectRatios]
  );

  return {
    ...state,
    config,
    providers,
    styles,
    providerConfig,
    modelConfig,
    modelParamDefinitions,
    supportedFeatures,
    aspectRatioOptions,
    setPrompt,
    setProvider,
    setModel,
    updateConfig,
    addReferenceFiles,
    updateReferenceImage,
    removeReferenceImage,
    clearReferenceImages,
    generate,
    generateFromChatInput,
    toggleResultSelection,
    saveSelectedResults,
    addToCanvas,
  };
}
