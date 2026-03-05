import { imageGenerationRequestSchema, type ImageGenerationRequest } from "./imageGenerationSchema";
import type { GeneratedImage, ImageGenerationResponse } from "@/types/imageGeneration";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

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
      imageUrl: item.imageUrl,
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

export async function generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
  const payload = imageGenerationRequestSchema.parse(request);
  const response = await fetch("/api/image-generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
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
  const fallbackImageUrl = typeof json.imageUrl === "string" ? json.imageUrl : undefined;

  const images =
    normalizedImages.length > 0
      ? normalizedImages
      : fallbackImageUrl
        ? [
            {
              imageUrl: fallbackImageUrl,
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
    imageUrl: fallbackImageUrl ?? images[0]?.imageUrl,
    images,
  };
}
