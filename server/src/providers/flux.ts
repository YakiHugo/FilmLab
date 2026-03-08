import { getConfig } from "../config";
import { isDataUrl } from "../shared/dataUrl";
import { fetchWithTimeout } from "../shared/fetchWithTimeout";
import { getStylePromptHint } from "../shared/imageStyleHints";
import type { ParsedImageGenerationRequest } from "../shared/imageGenerationSchema";
import { assertSafeRemoteUrl } from "../shared/safeRemoteUrl";
import type { ImageProviderAdapter } from "./types";
import { ProviderError, readProviderError } from "./types";

const FAL_ENDPOINTS: Record<string, string> = {
  "flux-pro": "fal-ai/flux-pro/v1.1",
  "flux-dev": "fal-ai/flux/dev",
  "flux-schnell": "fal-ai/flux/schnell",
};

const toDimensions = (request: ParsedImageGenerationRequest) => {
  if (request.width && request.height) {
    return {
      width: request.width,
      height: request.height,
    };
  }

  if (request.aspectRatio === "4:3") {
    return { width: 1536, height: 1152 };
  }
  if (request.aspectRatio === "3:4") {
    return { width: 1152, height: 1536 };
  }
  if (request.aspectRatio === "3:2") {
    return { width: 1536, height: 1024 };
  }
  if (request.aspectRatio === "2:3") {
    return { width: 1024, height: 1536 };
  }
  if (request.aspectRatio === "16:9") {
    return { width: 1536, height: 864 };
  }
  if (request.aspectRatio === "9:16") {
    return { width: 864, height: 1536 };
  }
  return { width: 1024, height: 1024 };
};

const extractImageUrls = (value: unknown): string[] => {
  if (!value || typeof value !== "object") {
    return [];
  }

  const payload = value as {
    imageUrl?: unknown;
    images?: Array<{ url?: unknown; imageUrl?: unknown }>;
    output?: Array<{ url?: unknown }>;
    data?: Array<{ url?: unknown }>;
  };

  if (typeof payload.imageUrl === "string" && payload.imageUrl.trim()) {
    return [payload.imageUrl];
  }

  const fromImages = (payload.images ?? [])
    .map((entry) => {
      if (typeof entry.url === "string") return entry.url;
      if (typeof entry.imageUrl === "string") return entry.imageUrl;
      return null;
    })
    .filter((entry): entry is string => Boolean(entry));
  if (fromImages.length > 0) {
    return fromImages;
  }

  const fromOutput = (payload.output ?? [])
    .map((entry) => (typeof entry.url === "string" ? entry.url : null))
    .filter((entry): entry is string => Boolean(entry));
  if (fromOutput.length > 0) {
    return fromOutput;
  }

  return (payload.data ?? [])
    .map((entry) => (typeof entry.url === "string" ? entry.url : null))
    .filter((entry): entry is string => Boolean(entry));
};

const buildPrompt = (request: ParsedImageGenerationRequest) => {
  const styleHint =
    request.style !== "none" ? getStylePromptHint(request.style) : "";
  const parts = [request.prompt.trim()];

  if (styleHint && styleHint !== "No style hint.") {
    parts.push(`Style: ${styleHint}`);
  }
  if (request.negativePrompt?.trim()) {
    parts.push(`Avoid: ${request.negativePrompt.trim()}`);
  }

  return parts.join("\n");
};

const toMimeType = (outputFormat: string) =>
  outputFormat === "jpeg" ? "image/jpeg" : "image/png";

export const fluxImageProvider: ImageProviderAdapter = {
  async generate(request, apiKey, options) {
    const endpointId = FAL_ENDPOINTS[request.model];
    if (!endpointId) {
      throw new ProviderError(`Unsupported Flux model: ${request.model}.`, 400);
    }
    const endpoint = `${getConfig().fluxApiBaseUrl}/${endpointId}`;
    const batchSize = Math.min(Math.max(request.batchSize ?? 1, 1), 4);
    const { width, height } = toDimensions(request);
    const outputFormat =
      typeof request.modelParams.outputFormat === "string"
        ? request.modelParams.outputFormat
        : "png";
    const safetyTolerance =
      typeof request.modelParams.safetyTolerance === "number"
        ? request.modelParams.safetyTolerance
        : undefined;
    const promptUpsampling =
      typeof request.modelParams.promptUpsampling === "boolean"
        ? request.modelParams.promptUpsampling
        : undefined;
    const referenceImages = await Promise.all(
      request.referenceImages.map(async (entry) => ({
        url: isDataUrl(entry.url)
          ? entry.url
          : (await assertSafeRemoteUrl(entry.url, "Flux reference image")).toString(),
        weight: entry.weight ?? 1,
        type: entry.type,
      }))
    );

    const upstream = await fetchWithTimeout(
      endpoint,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Key ${apiKey}`,
        },
        body: JSON.stringify({
          prompt: buildPrompt(request),
          image_size: { width, height },
          seed: typeof request.seed === "number" ? request.seed : undefined,
          guidance_scale: request.guidanceScale,
          num_inference_steps: request.steps,
          num_images: batchSize,
          output_format: outputFormat,
          safety_tolerance: safetyTolerance,
          prompt_upsampling: promptUpsampling,
          reference_images: referenceImages,
          sync_mode: true,
        }),
      },
      "Flux image generation timed out.",
      options
    );

    if (!upstream.ok) {
      throw new ProviderError(
        await readProviderError(upstream, "Flux image generation failed."),
        upstream.status
      );
    }

    const json = (await upstream.json()) as unknown;
    const urls = extractImageUrls(json);
    if (urls.length === 0) {
      throw new ProviderError("Flux provider returned no image URL.");
    }

    return {
      provider: "flux",
      model: request.model,
      images: urls.map((imageUrl) => ({
        imageUrl,
        mimeType: toMimeType(outputFormat),
      })),
    };
  },
};
