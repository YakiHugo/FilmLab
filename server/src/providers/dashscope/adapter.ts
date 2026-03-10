import { getConfig } from "../../config";
import { buildDashScopePrompt, extractDashScopeImages, toDashScopeSize } from "../dashscopeShared";
import type { PlatformProviderAdapter } from "../base/adapter";
import { createProviderRequestContext, fetchProviderResponse, toProviderRawResponse } from "../base/client";
import { ProviderError, readProviderError } from "../base/errors";

const getDashScopeGenerationUrl = () =>
  new URL(
    "/api/v1/services/aigc/multimodal-generation/generation",
    `${getConfig().dashscopeApiBaseUrl}/`
  ).toString();

const resolvePromptExtend = (modelFamily: string, value: unknown) => {
  if (typeof value === "boolean") {
    return value;
  }
  return modelFamily === "qwen";
};

const buildRequestBody = (input: Parameters<PlatformProviderAdapter["generate"]>[0]) => {
  const { target, request } = input;
  const parameters: Record<string, unknown> = {
    size: toDashScopeSize(request),
    prompt_extend: resolvePromptExtend(target.family.id, request.modelParams.promptExtend),
    ...(typeof request.seed === "number" ? { seed: request.seed } : {}),
  };

  if (target.family.id === "qwen") {
    parameters.n = Math.min(Math.max(request.batchSize ?? 1, 1), 6);
    if (request.negativePrompt?.trim()) {
      parameters.negative_prompt = request.negativePrompt.trim();
    }
  }

  return {
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
    parameters,
  };
};

export const dashscopePlatformAdapter: PlatformProviderAdapter = {
  async generate(input) {
    const normalizedApiKey = input.apiKey.trim();
    if (!normalizedApiKey) {
      throw new ProviderError("DashScope API key is required.", 401);
    }

    const context = createProviderRequestContext(input.options);
    const upstream = await fetchProviderResponse(
      getDashScopeGenerationUrl(),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${normalizedApiKey}`,
        },
        body: JSON.stringify(buildRequestBody(input)),
      },
      `${input.target.family.displayName} image generation timed out.`,
      context
    );

    if (!upstream.ok) {
      throw new ProviderError(
        await readProviderError(
          upstream,
          `${input.target.family.displayName} image generation failed.`
        ),
        upstream.status
      );
    }

    const rawResponse = toProviderRawResponse(upstream, (await upstream.json()) as unknown);
    const images = extractDashScopeImages(rawResponse.payload);
    if (images.length === 0) {
      throw new ProviderError(`${input.target.family.displayName} provider returned no image URL.`);
    }

    return {
      runtimeProvider: input.target.provider.id,
      modelFamily: input.target.family.id,
      legacyProvider: input.target.legacyProviderAlias,
      model: input.request.model,
      images,
    };
  },
};
