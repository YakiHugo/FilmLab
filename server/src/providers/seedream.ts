import { isProviderModelSupported } from "../../../shared/providerCapabilityRegistry";
import { getStylePromptHint } from "../shared/imageStyleHints";
import { fetchWithTimeout } from "../shared/fetchWithTimeout";
import type { ParsedImageGenerationRequest } from "../shared/imageGenerationSchema";
import type { ImageProviderAdapter, ProviderGeneratedImage } from "./types";
import { ProviderError, readProviderError } from "./types";

const ARK_IMAGE_GENERATION_URL = "https://ark.cn-beijing.volces.com/api/v3/images/generations";
const DEFAULT_MIME_TYPE = "image/jpeg";

const isRetriableUpstreamStatus = (statusCode: number) =>
  statusCode === 408 || statusCode === 409 || statusCode === 425 || statusCode === 429 || statusCode >= 500;

const SEEDREAM_SIZE_BY_ASPECT_RATIO: Record<
  Exclude<ParsedImageGenerationRequest["aspectRatio"], "custom">,
  string
> = {
  "1:1": "2K",
  "16:9": "2560x1440",
  "9:16": "1440x2560",
  "4:3": "2304x1728",
  "3:4": "1728x2304",
  "3:2": "2352x1568",
  "2:3": "1568x2352",
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const toArkSize = (request: ParsedImageGenerationRequest) =>
  request.aspectRatio === "custom"
    ? SEEDREAM_SIZE_BY_ASPECT_RATIO["1:1"]
    : SEEDREAM_SIZE_BY_ASPECT_RATIO[request.aspectRatio];

const resolveResponseFormat = (request: ParsedImageGenerationRequest) => {
  const value = request.modelParams.responseFormat;
  return value === "b64_json" ? "b64_json" : "url";
};

const resolveSequentialImageGeneration = (request: ParsedImageGenerationRequest) => {
  const value = request.modelParams.sequentialImageGeneration;
  return value === "enabled" ? "enabled" : "disabled";
};

const resolveWatermark = (request: ParsedImageGenerationRequest) => {
  const value = request.modelParams.watermark;
  return typeof value === "boolean" ? value : true;
};

const buildPrompt = (request: ParsedImageGenerationRequest) => {
  const styleHint = request.style !== "none" ? getStylePromptHint(request.style) : "";
  const parts = [request.prompt.trim()];

  if (styleHint && styleHint !== "No style hint.") {
    parts.push(`Style: ${styleHint}`);
  }

  return parts.join("\n");
};

const readSeedreamErrorMessage = (payload: Record<string, unknown>) => {
  if (typeof payload.message === "string" && payload.message.trim()) {
    return payload.message.trim();
  }
  if (isRecord(payload.error) && typeof payload.error.message === "string") {
    const message = payload.error.message.trim();
    if (message) {
      return message;
    }
  }

  const failedEntries = Array.isArray(payload.data)
    ? payload.data.filter(
        (entry): entry is Record<string, unknown> =>
          isRecord(entry) && isRecord(entry.error) && typeof entry.error.message === "string"
      )
    : [];
  const firstEntryError = failedEntries[0]?.error;
  if (isRecord(firstEntryError) && typeof firstEntryError.message === "string") {
    const message = firstEntryError.message.trim();
    if (message) {
      return message;
    }
  }

  return "Seedream image generation failed.";
};

const extractImages = (
  payload: Record<string, unknown>
): { images: ProviderGeneratedImage[]; warnings: string[] } => {
  if (!Array.isArray(payload.data)) {
    return {
      images: [],
      warnings: [],
    };
  }

  return payload.data.reduce<{ images: ProviderGeneratedImage[]; warnings: string[] }>(
    (accumulator, entry) => {
      if (!isRecord(entry)) {
        return accumulator;
      }

      if (typeof entry.url === "string" && entry.url.trim()) {
        accumulator.images.push({
          imageUrl: entry.url,
          revisedPrompt:
            typeof entry.revised_prompt === "string" ? entry.revised_prompt : null,
        });
        return accumulator;
      }

      if (typeof entry.b64_json === "string" && entry.b64_json.trim()) {
        accumulator.images.push({
          binaryData: Buffer.from(entry.b64_json, "base64"),
          mimeType: DEFAULT_MIME_TYPE,
          revisedPrompt:
            typeof entry.revised_prompt === "string" ? entry.revised_prompt : null,
        });
        return accumulator;
      }

      if (isRecord(entry.error) && typeof entry.error.message === "string") {
        const message = entry.error.message.trim();
        if (message) {
          accumulator.warnings.push(message);
        }
      }

      return accumulator;
    },
    {
      images: [],
      warnings: [],
    }
  );
};

export const seedreamImageProvider: ImageProviderAdapter = {
  async generate(request, apiKey, options) {
    if (!isProviderModelSupported("seedream", request.model)) {
      throw new ProviderError(`Unsupported Seedream model: ${request.model}.`, 400);
    }
    const normalizedApiKey = apiKey.trim();
    if (!normalizedApiKey) {
      throw new ProviderError("Seedream API key is required.", 401);
    }

    const upstream = await fetchWithTimeout(
      ARK_IMAGE_GENERATION_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${normalizedApiKey}`,
        },
        body: JSON.stringify({
          model: request.model,
          prompt: buildPrompt(request),
          size: toArkSize(request),
          sequential_image_generation: resolveSequentialImageGeneration(request),
          response_format: resolveResponseFormat(request),
          stream: false,
          watermark: resolveWatermark(request),
        }),
      },
      "Seedream image generation timed out.",
      options
    );

    if (!upstream.ok) {
      throw new ProviderError(
        await readProviderError(upstream, "Seedream image generation failed."),
        upstream.status,
        undefined,
        {
          isRetriable: isRetriableUpstreamStatus(upstream.status),
        }
      );
    }

    const json = (await upstream.json()) as unknown;
    if (!isRecord(json)) {
      throw new ProviderError("Seedream provider returned an invalid response.");
    }

    const { images, warnings } = extractImages(json);
    if (images.length === 0) {
      throw new ProviderError(readSeedreamErrorMessage(json));
    }

    return {
      provider: "seedream",
      model: request.model,
      images,
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  },
};

export default seedreamImageProvider;
