import { getStylePromptHint } from "../../../shared/imageStyleHints";
import { createProviderRequestContext, fetchProviderResponse, toProviderRawResponse } from "../../base/client";
import { ProviderError, readProviderError } from "../../base/errors";
import type {
  PlatformProviderGenerateInput,
  ProviderGeneratedImage,
  RuntimeGenerationResult,
} from "../../base/types";

const DEFAULT_MIME_TYPE = "image/jpeg";
const SUPPORTED_MODELS = new Set(["doubao-seedream-5-0-260128", "doubao-seedream-4-0-250828"]);

const SEEDREAM_SIZE_BY_ASPECT_RATIO = {
  "1:1": "2K",
  "16:9": "2560x1440",
  "9:16": "1440x2560",
  "4:3": "2304x1728",
  "3:4": "1728x2304",
  "3:2": "2352x1568",
  "2:3": "1568x2352",
  "21:9": "2560x1080",
} as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const getArkImageGenerationUrl = (baseUrl: string) =>
  new URL("/api/v3/images/generations", `${baseUrl}/`).toString();

const toArkSize = (aspectRatio: string) =>
  aspectRatio === "custom"
    ? SEEDREAM_SIZE_BY_ASPECT_RATIO["1:1"]
    : SEEDREAM_SIZE_BY_ASPECT_RATIO[aspectRatio as keyof typeof SEEDREAM_SIZE_BY_ASPECT_RATIO];

const buildPrompt = (prompt: string, style: Parameters<typeof getStylePromptHint>[0]) => {
  const styleHint = style !== "none" ? getStylePromptHint(style) : "";
  const parts = [prompt.trim()];

  if (styleHint && styleHint !== "No style hint.") {
    parts.push(`Style: ${styleHint}`);
  }

  return parts.join("\n");
};

const resolveResponseFormat = (value: unknown) => (value === "b64_json" ? "b64_json" : "url");
const resolveSequentialImageGeneration = (value: unknown) =>
  value === "enabled" ? "enabled" : "disabled";
const resolveWatermark = (value: unknown) => (typeof value === "boolean" ? value : true);

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

export const generateArkSeedream = async (
  input: PlatformProviderGenerateInput
): Promise<RuntimeGenerationResult> => {
  const providerModel = input.target.deployment.providerModel;
  if (!SUPPORTED_MODELS.has(providerModel)) {
    throw new ProviderError(`Unsupported Ark model: ${providerModel}.`, 400);
  }

  const normalizedApiKey = input.credentials.apiKey?.trim() ?? "";
  if (!normalizedApiKey) {
    throw new ProviderError("Ark API key is required.", 401);
  }

  const context = createProviderRequestContext(input.options);
  const upstream = await fetchProviderResponse(
    getArkImageGenerationUrl(input.credentials.baseUrl),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${normalizedApiKey}`,
      },
      body: JSON.stringify({
        model: providerModel,
        prompt: buildPrompt(input.request.prompt, input.request.style),
        size: toArkSize(input.request.aspectRatio),
        sequential_image_generation: resolveSequentialImageGeneration(
          input.request.modelParams.sequentialImageGeneration
        ),
        response_format: resolveResponseFormat(input.request.modelParams.responseFormat),
        stream: false,
        watermark: resolveWatermark(input.request.modelParams.watermark),
      }),
    },
    "Ark image generation timed out.",
    context
  );

  if (!upstream.ok) {
    throw new ProviderError(
      await readProviderError(upstream, "Ark image generation failed."),
      upstream.status
    );
  }

  const rawResponse = toProviderRawResponse(upstream, (await upstream.json()) as unknown);
  if (!isRecord(rawResponse.payload)) {
    throw new ProviderError("Ark provider returned an invalid response.");
  }

  const { images, warnings } = extractImages(rawResponse.payload);
  if (images.length === 0) {
    throw new ProviderError(readSeedreamErrorMessage(rawResponse.payload));
  }

  return {
    modelId: input.target.frontendModel.id,
    logicalModel: input.target.frontendModel.logicalModel,
    deploymentId: input.target.deployment.id,
    runtimeProvider: input.target.provider.id,
    providerModel,
    images,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
};
