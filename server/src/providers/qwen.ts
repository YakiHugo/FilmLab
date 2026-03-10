import { getImageModelConfig } from "../../../shared/imageProviderCatalog";
import { getConfig } from "../config";
import { fetchWithTimeout } from "../shared/fetchWithTimeout";
import type { ImageProviderAdapter } from "./types";
import { ProviderError } from "./types";
import {
  normalizeHttpProviderError,
  normalizeInvalidProviderResponseError,
} from "./errorNormalizer";
import {
  buildDashScopePrompt,
  extractDashScopeImages,
  toDashScopeSize,
} from "./dashscopeShared";

const getDashScopeGenerationUrl = () =>
  new URL(
    "/api/v1/services/aigc/multimodal-generation/generation",
    `${getConfig().dashscopeApiBaseUrl}/`
  ).toString();

const resolvePromptExtend = (request: Parameters<ImageProviderAdapter["generate"]>[0]) => {
  const value = request.modelParams.promptExtend;
  return typeof value === "boolean" ? value : true;
};

export const qwenImageProvider: ImageProviderAdapter = {
  async generate(request, apiKey, options) {
    if (!getImageModelConfig("qwen", request.model)) {
      throw new ProviderError(`Unsupported Qwen model: ${request.model}.`, 400);
    }

    const normalizedApiKey = apiKey.trim();
    if (!normalizedApiKey) {
      throw new ProviderError("DashScope API key is required.", 401);
    }

    const upstream = await fetchWithTimeout(
      getDashScopeGenerationUrl(),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${normalizedApiKey}`,
        },
        body: JSON.stringify({
          model: request.model,
          input: {
            messages: [
              {
                role: "user",
                content: [
                  {
                    text: buildDashScopePrompt(request),
                  },
                ],
              },
            ],
          },
          parameters: {
            size: toDashScopeSize(request),
            n: Math.min(Math.max(request.batchSize ?? 1, 1), 6),
            prompt_extend: resolvePromptExtend(request),
            ...(typeof request.seed === "number" ? { seed: request.seed } : {}),
            ...(request.negativePrompt?.trim()
              ? { negative_prompt: request.negativePrompt.trim() }
              : {}),
          },
        }),
      },
      "Qwen image generation timed out.",
      { ...options, provider: "qwen" }
    );

    if (!upstream.ok) {
      throw await normalizeHttpProviderError({
        response: upstream,
        fallbackMessage: "Qwen image generation failed.",
        provider: "qwen",
      });
    }

    const json = (await upstream.json()) as unknown;
    const images = extractDashScopeImages(json);
    if (images.length === 0) {
      throw normalizeInvalidProviderResponseError({
        message: "Qwen provider returned no image URL.",
        provider: "qwen",
      });
    }

    return {
      provider: "qwen",
      model: request.model,
      images,
    };
  },
};
