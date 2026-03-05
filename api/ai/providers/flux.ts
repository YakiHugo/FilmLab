import { getImageStyleConfig } from "../../../src/lib/ai/imageStyles";
import type { ImageGenerationRequest } from "../../../src/types/imageGeneration";
import type { ImageProviderAdapter } from "../types";

const toDimensions = (request: ImageGenerationRequest) => {
  if (
    request.aspectRatio === "custom" &&
    request.width &&
    request.height
  ) {
    return {
      width: request.width,
      height: request.height,
    };
  }

  if (request.aspectRatio === "16:9") {
    return { width: 1344, height: 768 };
  }
  if (request.aspectRatio === "9:16") {
    return { width: 768, height: 1344 };
  }
  if (request.aspectRatio === "3:2" || request.aspectRatio === "4:3") {
    return { width: 1216, height: 832 };
  }
  if (request.aspectRatio === "2:3" || request.aspectRatio === "3:4") {
    return { width: 832, height: 1216 };
  }
  return { width: 1024, height: 1024 };
};

const toFalImageSize = (request: ImageGenerationRequest) => {
  if (request.aspectRatio === "16:9") return "landscape_16_9";
  if (request.aspectRatio === "9:16") return "portrait_16_9";
  if (request.aspectRatio === "3:2") return "landscape_4_3";
  if (request.aspectRatio === "2:3") return "portrait_4_3";
  return "square_hd";
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
      if (typeof entry.url === "string") {
        return entry.url;
      }
      if (typeof entry.imageUrl === "string") {
        return entry.imageUrl;
      }
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

const buildPrompt = (request: ImageGenerationRequest) => {
  const styleHint =
    request.style && request.style !== "none"
      ? getImageStyleConfig(request.style)?.promptHint
      : "";
  const parts = [request.prompt.trim()];
  if (styleHint) {
    parts.push(`Style: ${styleHint}`);
  }
  if (request.negativePrompt?.trim()) {
    parts.push(`Avoid: ${request.negativePrompt.trim()}`);
  }
  return parts.join("\n");
};

export const fluxImageProvider: ImageProviderAdapter = {
  async generate(request) {
    const apiKey = process.env.FLUX_API_KEY;
    if (!apiKey) {
      throw new Error("FLUX_API_KEY is not configured.");
    }

    const endpoint = process.env.FLUX_API_URL ?? "https://fal.run/fal-ai/flux/dev";
    const batchSize = Math.min(Math.max(request.batchSize ?? 1, 1), 4);
    const { width, height } = toDimensions(request);
    const outputFormat =
      typeof request.modelParams?.outputFormat === "string"
        ? request.modelParams.outputFormat
        : "png";
    const safetyTolerance =
      typeof request.modelParams?.safetyTolerance === "number"
        ? request.modelParams.safetyTolerance
        : undefined;
    const promptUpsampling =
      typeof request.modelParams?.promptUpsampling === "boolean"
        ? request.modelParams.promptUpsampling
        : undefined;
    const images: Array<{ imageUrl: string }> = [];

    for (let index = 0; index < batchSize; index += 1) {
      const upstream = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Key ${apiKey}`,
        },
        body: JSON.stringify({
          prompt: buildPrompt(request),
          image_size: toFalImageSize(request),
          width,
          height,
          seed: typeof request.seed === "number" ? request.seed + index : undefined,
          guidance_scale: request.guidanceScale,
          num_inference_steps: request.steps,
          num_images: 1,
          output_format: outputFormat,
          safety_tolerance: safetyTolerance,
          prompt_upsampling: promptUpsampling,
          reference_images: request.referenceImages?.map((entry) => ({
            url: entry.url,
            weight: entry.weight ?? 1,
            type: entry.type,
          })),
        }),
      });

      if (!upstream.ok) {
        throw new Error((await upstream.text()) || "Flux image generation failed.");
      }

      const json = (await upstream.json()) as unknown;
      const urls = extractImageUrls(json);
      if (urls.length === 0) {
        throw new Error(
          "Flux provider returned no direct image URL. Configure FLUX_API_URL to a synchronous endpoint that returns image URLs."
        );
      }

      for (const url of urls) {
        images.push({ imageUrl: url });
      }
    }

    if (images.length === 0) {
      throw new Error("No image returned from Flux provider.");
    }

    return {
      provider: "flux",
      model: request.model,
      images,
    };
  },
};
