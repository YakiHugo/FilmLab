import { useCallback, useMemo, useState } from "react";
import { generateImage as requestImageGeneration } from "@/lib/ai/imageGeneration";
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

interface ImageGenerationState {
  status: "idle" | "loading" | "done" | "error";
  error: string | null;
  prompt: string;
  results: Array<GeneratedImage & { assetId: string | null }>;
}

interface ImportedImage {
  imageUrl: string;
  assetId: string | null;
  provider: GeneratedImage["provider"];
  model: string;
  mimeType?: string;
  revisedPrompt?: string | null;
}

interface ImportedGenerationResult {
  imageUrl: string;
  assetId: string | null;
  images: ImportedImage[];
  importedAssetIds: string[];
}

const createElementId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `canvas-image-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
};

const blobToFileExtension = (mimeType: string) => (mimeType.includes("jpeg") ? "jpg" : "png");

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
  negativePrompt: supportedFeatures.negativePrompt
    ? config.negativePrompt || undefined
    : undefined,
  referenceImages: supportedFeatures.referenceImages ? config.referenceImages : [],
  seed: supportedFeatures.seed ? config.seed ?? undefined : undefined,
  guidanceScale: supportedFeatures.guidanceScale
    ? config.guidanceScale ?? undefined
    : undefined,
  steps: supportedFeatures.steps ? config.steps ?? undefined : undefined,
  sampler: config.sampler || undefined,
  batchSize: config.batchSize,
  modelParams: config.modelParams,
});

const toUploadFiles = async (images: GeneratedImage[]) =>
  Promise.all(
    images.map(async (image, index) => {
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

export async function generateAndImportImage(
  request: ImageGenerationRequest
): Promise<ImportedGenerationResult> {
  const generated = await requestImageGeneration(request);
  const files = await toUploadFiles(generated.images);
  const importResult = await useAssetStore.getState().importAssets(files);

  for (const assetId of importResult.addedAssetIds) {
    useAssetStore.getState().updateAsset(assetId, { source: "ai-generated" });
  }

  const importedAssetIds = importResult.addedAssetIds;
  if (importedAssetIds[0]) {
    useAssetStore.getState().setSelectedAssetIds([importedAssetIds[0]]);
  }

  const images = generated.images.map((image, index) => ({
    ...image,
    assetId: importedAssetIds[index] ?? null,
  }));

  return {
    imageUrl: images[0]?.imageUrl ?? generated.imageUrl ?? "",
    assetId: importedAssetIds[0] ?? null,
    images,
    importedAssetIds,
  };
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
    results: [],
  });

  const supportedFeatures = providerConfig.supportedFeatures;

  const setPrompt = useCallback((prompt: string) => {
    setState((previous) => ({ ...previous, prompt }));
  }, []);

  const generate = useCallback(async () => {
    const prompt = state.prompt.trim();
    if (!prompt) {
      setState((previous) => ({
        ...previous,
        status: "error",
        error: "Prompt is required.",
      }));
      return null;
    }

    setState((previous) => ({
      ...previous,
      status: "loading",
      error: null,
      results: [],
    }));

    try {
      const result = await generateAndImportImage(
        toImageRequest(prompt, config, supportedFeatures)
      );
      setState((previous) => ({
        ...previous,
        status: "done",
        error: null,
        results: result.images,
      }));
      return result;
    } catch (error) {
      setState((previous) => ({
        ...previous,
        status: "error",
        results: [],
        error:
          error instanceof Error
            ? error.message
            : "Image generation failed.",
      }));
      return null;
    }
  }, [config, state.prompt, supportedFeatures]);

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
      if (
        supportedFeatures.referenceImages &&
        input.files &&
        input.files.length > 0
      ) {
        const entries = await filesToReferenceImages(input.files);
        addReferenceImages(entries);
        configForRequest = {
          ...configForRequest,
          referenceImages: [
            ...config.referenceImages,
            ...entries,
          ].slice(0, 4),
        };
      }

      setState((previous) => ({
        ...previous,
        prompt,
        status: "loading",
        error: null,
        results: [],
      }));

      try {
        const result = await generateAndImportImage(
          toImageRequest(prompt, configForRequest, supportedFeatures)
        );
        setState((previous) => ({
          ...previous,
          status: "done",
          error: null,
          results: result.images,
        }));
        return result;
      } catch (error) {
        setState((previous) => ({
          ...previous,
          status: "error",
          results: [],
          error:
            error instanceof Error
              ? error.message
              : "Image generation failed.",
        }));
        return null;
      }
    },
    [addReferenceImages, config, supportedFeatures]
  );

  const addToCanvas = useCallback(async (assetId?: string | null) => {
    const finalAssetId = assetId ?? state.results[0]?.assetId ?? null;
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
  }, [state.results]);

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
    addToCanvas,
  };
}
