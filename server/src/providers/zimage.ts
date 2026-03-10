import { getImageModelConfig } from "../../../shared/imageProviderCatalog";
import { getConfig } from "../config";
import { fetchWithTimeout } from "../shared/fetchWithTimeout";
import type { ImageProviderAdapter } from "./types";
import { ProviderError, readProviderError } from "./types";
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
  return typeof value === "boolean" ? value : false;
};

export const zImageProvider: ImageProviderAdapter = {
  async generate(request, apiKey, options) {
    if (!getImageModelConfig("zimage", request.model)) {
      throw new ProviderError(`Unsupported Z Image model: ${request.model}.`, 400);
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
            prompt_extend: resolvePromptExtend(request),
            ...(typeof request.seed === "number" ? { seed: request.seed } : {}),
          },
        }),
      },
      "Z Image generation timed out.",
      options
    );

    if (!upstream.ok) {
      throw new ProviderError(
        await readProviderError(upstream, "Z Image generation failed."),
        upstream.status
      );
    }

    const json = (await upstream.json()) as unknown;
    const images = extractDashScopeImages(json);
    if (images.length === 0) {
      throw new ProviderError("Z Image provider returned no image URL.");
    }

    return {
      provider: "zimage",
      model: request.model,
      images,
    };
  },
};
