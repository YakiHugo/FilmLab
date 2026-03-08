import { imageGenerationRequestSchema, type ImageGenerationRequest } from "./imageGenerationSchema";
import { resolveApiUrl } from "@/lib/api/resolveApiUrl";
import type { GeneratedImage, ImageGenerationResponse } from "@/types/imageGeneration";
import { getProviderApiKey } from "@/stores/apiKeyStore";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const GENERATION_REQUEST_TIMEOUT_MS = 125_000;

interface GenerateImageOptions {
  signal?: AbortSignal;
}

const createAbortError = () => {
  if (typeof DOMException === "function") {
    return new DOMException("The operation was aborted.", "AbortError");
  }
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
};

const mergeAbortSignals = (signals: Array<AbortSignal | undefined>) => {
  const activeSignals = signals.filter(Boolean) as AbortSignal[];
  if (activeSignals.length <= 1) {
    return {
      signal: activeSignals[0],
      cleanup: () => undefined,
    };
  }

  const controller = new AbortController();
  const abort = () => {
    controller.abort();
  };

  for (const signal of activeSignals) {
    if (signal.aborted) {
      controller.abort();
      return {
        signal: controller.signal,
        cleanup: () => undefined,
      };
    }
  }

  for (const signal of activeSignals) {
    signal.addEventListener("abort", abort, { once: true });
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      for (const signal of activeSignals) {
        signal.removeEventListener("abort", abort);
      }
    },
  };
};

const fetchWithTimeout = async (
  input: RequestInfo | URL,
  init: RequestInit,
  options?: GenerateImageOptions
) => {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => {
    controller.abort();
  }, GENERATION_REQUEST_TIMEOUT_MS);
  const { signal, cleanup } = mergeAbortSignals([controller.signal, options?.signal]);

  try {
    return await fetch(input, {
      ...init,
      signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      if (options?.signal?.aborted && !controller.signal.aborted) {
        throw createAbortError();
      }
      throw new Error("Image generation timed out.", { cause: error });
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeoutId);
    cleanup();
  }
};

const normalizeImages = (value: unknown, fallbackProvider: string, fallbackModel: string): GeneratedImage[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized: GeneratedImage[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.imageUrl !== "string") {
      continue;
    }
    normalized.push({
      imageUrl: resolveApiUrl(item.imageUrl),
      ...(typeof item.imageId === "string" ? { imageId: item.imageId } : {}),
      provider: (
        typeof item.provider === "string" ? item.provider : fallbackProvider
      ) as GeneratedImage["provider"],
      model: typeof item.model === "string" ? item.model : fallbackModel,
      ...(typeof item.mimeType === "string" ? { mimeType: item.mimeType } : {}),
      ...(typeof item.revisedPrompt === "string" || item.revisedPrompt === null
        ? { revisedPrompt: item.revisedPrompt }
        : {}),
    });
  }
  return normalized;
};

export async function generateImage(
  request: ImageGenerationRequest,
  options?: GenerateImageOptions
): Promise<ImageGenerationResponse> {
  const payload = imageGenerationRequestSchema.parse(request);
  const providerKey = getProviderApiKey(payload.provider);
  const response = await fetchWithTimeout(resolveApiUrl("/api/image-generate"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(providerKey ? { [`X-Provider-Key-${payload.provider}`]: providerKey } : {}),
    },
    body: JSON.stringify(payload),
  }, options);
  if (!response.ok) {
    let message = "Image generation failed.";
    try {
      const errorPayload = (await response.json()) as { error?: string };
      if (typeof errorPayload.error === "string" && errorPayload.error.trim()) {
        message = errorPayload.error;
      }
    } catch {
      // Keep fallback message.
    }
    throw new Error(message);
  }

  const json = (await response.json()) as unknown;
  if (!isRecord(json)) {
    throw new Error("Invalid image generation response.");
  }

  const provider = (typeof json.provider === "string" ? json.provider : payload.provider) as ImageGenerationResponse["provider"];
  const model = typeof json.model === "string" ? json.model : payload.model;
  const createdAt = typeof json.createdAt === "string" ? json.createdAt : new Date().toISOString();
  const normalizedImages = normalizeImages(json.images, provider, model);
  const fallbackImageUrl =
    typeof json.imageUrl === "string" ? resolveApiUrl(json.imageUrl) : undefined;

  const images =
    normalizedImages.length > 0
      ? normalizedImages
      : fallbackImageUrl
        ? [
            {
              imageUrl: fallbackImageUrl,
              ...(typeof json.imageId === "string" ? { imageId: json.imageId } : {}),
              provider,
              model,
            },
          ]
        : [];

  if (images.length === 0) {
    throw new Error("No generated image was returned.");
  }

  return {
    provider,
    model,
    createdAt,
    ...(typeof json.imageId === "string" ? { imageId: json.imageId } : {}),
    imageUrl: fallbackImageUrl ?? images[0]?.imageUrl,
    images,
  };
}
