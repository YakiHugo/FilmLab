import { getStylePromptHint } from "../shared/imageStyleHints";
import { fetchWithTimeout } from "../shared/fetchWithTimeout";
import type { ParsedImageGenerationRequest } from "../shared/imageGenerationSchema";
import type { ImageProviderAdapter, ProviderGeneratedImage } from "./types";
import { ProviderError, readProviderError } from "./types";

const toOpenAiSize = (request: ParsedImageGenerationRequest) => {
  const portrait =
    request.aspectRatio === "9:16" ||
    request.aspectRatio === "2:3" ||
    request.aspectRatio === "3:4";
  const landscape =
    request.aspectRatio === "16:9" ||
    request.aspectRatio === "3:2" ||
    request.aspectRatio === "4:3";

  if (request.model === "dall-e-3") {
    if (portrait) return "1024x1536";
    if (landscape) return "1536x1024";
    return "1024x1024";
  }

  if (portrait) return "1024x1536";
  if (landscape) return "1536x1024";
  return "1024x1024";
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

const extractImages = (
  payload: {
    data?: Array<{
      b64_json?: string;
      url?: string;
      revised_prompt?: string;
    }>;
  },
  mimeType: string
): ProviderGeneratedImage[] =>
  (payload.data ?? []).reduce<ProviderGeneratedImage[]>((images, entry) => {
    if (entry.url) {
      images.push({
        imageUrl: entry.url,
        revisedPrompt: entry.revised_prompt ?? null,
      });
      return images;
    }

    if (entry.b64_json) {
      images.push({
        binaryData: Buffer.from(entry.b64_json, "base64"),
        mimeType,
        revisedPrompt: entry.revised_prompt ?? null,
      });
    }

    return images;
  }, []);

export const openAiImageProvider: ImageProviderAdapter = {
  async generate(request, apiKey, options) {
    const batchSize = Math.min(Math.max(request.batchSize ?? 1, 1), 4);
    if (request.model === "dall-e-3" && batchSize > 1) {
      throw new ProviderError("DALL-E 3 supports batch size 1 only.", 400);
    }

    const body: Record<string, unknown> = {
      model: request.model,
      prompt: buildPrompt(request),
      size: toOpenAiSize(request),
      n: batchSize,
    };

    if (request.model === "dall-e-3") {
      if (typeof request.modelParams.quality === "string") {
        body.quality = request.modelParams.quality;
      }
      if (typeof request.modelParams.styleTone === "string") {
        body.style = request.modelParams.styleTone;
      }
    } else {
      if (typeof request.modelParams.quality === "string") {
        body.quality = request.modelParams.quality;
      }
      if (typeof request.modelParams.background === "string") {
        body.background = request.modelParams.background;
      }
      if (typeof request.modelParams.outputFormat === "string") {
        body.output_format = request.modelParams.outputFormat;
      }
    }

    const upstream = await fetchWithTimeout(
      "https://api.openai.com/v1/images/generations",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      },
      "OpenAI image generation timed out.",
      options
    );

    if (!upstream.ok) {
      throw new ProviderError(
        await readProviderError(upstream, "OpenAI image generation failed."),
        upstream.status
      );
    }

    const json = (await upstream.json()) as {
      data?: Array<{ b64_json?: string; url?: string; revised_prompt?: string }>;
    };
    const mimeType =
      request.model === "gpt-image-1" && typeof request.modelParams.outputFormat === "string"
        ? `image/${request.modelParams.outputFormat}`
        : "image/png";
    const images = extractImages(json, mimeType);

    if (images.length === 0) {
      throw new ProviderError("No image returned from OpenAI.");
    }

    return {
      provider: "openai",
      model: request.model,
      images,
    };
  },
};
