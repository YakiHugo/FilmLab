import { useCallback, useState } from "react";
import { generateImage as requestImageGeneration } from "@/lib/ai/imageGeneration";
import type { ImageGenerationRequest } from "@/lib/ai/imageGenerationSchema";
import type { CanvasImageElement } from "@/types";
import { useAssetStore } from "@/stores/assetStore";
import { useCanvasStore } from "@/stores/canvasStore";

interface ImageGenerationState {
  status: "idle" | "loading" | "done" | "error";
  imageUrl: string | null;
  error: string | null;
  prompt: string;
  provider: "openai" | "stability";
  model: string;
  size: string;
  assetId: string | null;
}

const createElementId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `canvas-image-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
};

const blobToFileExtension = (mimeType: string) => (mimeType.includes("jpeg") ? "jpg" : "png");

export async function generateAndImportImage(request: ImageGenerationRequest) {
  const generated = await requestImageGeneration(request);
  const imageResponse = await fetch(generated.imageUrl);
  if (!imageResponse.ok) {
    throw new Error("Generated image could not be downloaded.");
  }

  const blob = await imageResponse.blob();
  const mimeType = blob.type || "image/png";
  const extension = blobToFileExtension(mimeType);
  const file = new File([blob], `ai-${Date.now()}.${extension}`, { type: mimeType });
  const importResult = await useAssetStore.getState().importAssets([file]);

  for (const assetId of importResult.addedAssetIds) {
    useAssetStore.getState().updateAsset(assetId, { source: "ai-generated" });
  }

  const assetId = importResult.addedAssetIds[0] ?? null;
  if (assetId) {
    useAssetStore.getState().setSelectedAssetIds([assetId]);
  }

  return {
    imageUrl: generated.imageUrl,
    assetId,
    importedAssetIds: importResult.addedAssetIds,
  };
}

export function useImageGeneration() {
  const [state, setState] = useState<ImageGenerationState>({
    status: "idle",
    imageUrl: null,
    error: null,
    prompt: "",
    provider: "openai",
    model: "gpt-image-1",
    size: "1024x1024",
    assetId: null,
  });

  const setPrompt = useCallback((prompt: string) => {
    setState((previous) => ({ ...previous, prompt }));
  }, []);

  const setProvider = useCallback((provider: "openai" | "stability") => {
    setState((previous) => ({
      ...previous,
      provider,
      model: provider === "openai" ? "gpt-image-1" : "stable-image-core",
    }));
  }, []);

  const setModel = useCallback((model: string) => {
    setState((previous) => ({ ...previous, model }));
  }, []);

  const setSize = useCallback((size: string) => {
    setState((previous) => ({ ...previous, size }));
  }, []);

  const generate = useCallback(async () => {
    const prompt = state.prompt.trim();
    if (!prompt) {
      setState((previous) => ({ ...previous, status: "error", error: "Prompt is required." }));
      return null;
    }

    setState((previous) => ({
      ...previous,
      status: "loading",
      error: null,
      imageUrl: null,
      assetId: null,
    }));

    try {
      const result = await generateAndImportImage({
        prompt,
        provider: state.provider,
        model: state.model,
        size: state.size,
      });
      setState((previous) => ({
        ...previous,
        status: "done",
        imageUrl: result.imageUrl,
        assetId: result.assetId,
      }));
      return result;
    } catch (error) {
      setState((previous) => ({
        ...previous,
        status: "error",
        imageUrl: null,
        assetId: null,
        error: error instanceof Error ? error.message : "Image generation failed.",
      }));
      return null;
    }
  }, [state.model, state.prompt, state.provider, state.size]);

  const addToCanvas = useCallback(async () => {
    if (!state.assetId) {
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
      assetId: state.assetId,
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
  }, [state.assetId]);

  return {
    ...state,
    setPrompt,
    setProvider,
    setModel,
    setSize,
    generate,
    addToCanvas,
  };
}
