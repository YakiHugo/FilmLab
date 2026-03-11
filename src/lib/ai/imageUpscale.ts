import { resolveApiUrl } from "@/lib/api/resolveApiUrl";
import { getImageProviderCredentialSlot, isImageProviderId } from "@/lib/ai/imageProviders";
import type { GeneratedImage } from "@/types/imageGeneration";
import { imageUpscaleRequestSchema, type ImageUpscaleRequest } from "./imageUpscaleSchema";

const UPSCALE_REQUEST_TIMEOUT_MS = 125_000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

interface UpscaleImageOptions {
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
  options?: UpscaleImageOptions
) => {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => {
    controller.abort();
  }, UPSCALE_REQUEST_TIMEOUT_MS);
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
      throw new Error("Image upscale timed out.", { cause: error });
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeoutId);
    cleanup();
  }
};

export async function upscaleImage(
  request: ImageUpscaleRequest,
  options?: UpscaleImageOptions
): Promise<GeneratedImage> {
  const payload = imageUpscaleRequestSchema.parse(request);
  const response = await fetchWithTimeout(
    resolveApiUrl("/api/image-upscale"),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    options
  );

  if (!response.ok) {
    let message = "Image upscale failed.";
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
  if (!isRecord(json) || typeof json.imageUrl !== "string") {
    throw new Error("Invalid image upscale response.");
  }

  const provider =
    typeof json.provider === "string" && isImageProviderId(json.provider)
      ? json.provider
      : (getImageProviderCredentialSlot(payload.provider) ?? "ark");

  return {
    imageUrl: resolveApiUrl(json.imageUrl),
    ...(typeof json.imageId === "string" ? { imageId: json.imageId } : {}),
    provider,
    model: typeof json.model === "string" ? json.model : payload.model,
    ...(typeof json.mimeType === "string" ? { mimeType: json.mimeType } : {}),
  };
}
