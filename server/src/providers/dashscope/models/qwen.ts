import { getConfig } from "../../../config";
import { buildDashScopePrompt, extractDashScopeImages, toDashScopeSize } from "../../dashscopeShared";
import { createProviderRequestContext, fetchProviderResponse } from "../../base/client";
import { ProviderError, readProviderError } from "../../base/errors";
import type { PlatformProviderGenerateInput, RuntimeGenerationResult } from "../../base/types";

const SUPPORTED_MODELS = new Set(["qwen-image-2.0-pro", "qwen-image-2.0"]);

const getDashScopeGenerationUrl = () =>
  new URL(
    "/api/v1/services/aigc/multimodal-generation/generation",
    `${getConfig().dashscopeApiBaseUrl}/`
  ).toString();

const resolvePromptExtend = (value: unknown) => (typeof value === "boolean" ? value : true);

const buildQwenMessageContent = (input: PlatformProviderGenerateInput) => {
  const referenceImages = (input.request.resolvedInputAssets ?? [])
    .filter((referenceImage) => Boolean(referenceImage.signedUrl.trim()))
    .map((referenceImage) => ({
      image: referenceImage.signedUrl.trim(),
    }));

  if (referenceImages.length > 3) {
    throw new ProviderError("Qwen supports at most 3 input images per request.", 400);
  }

  if (referenceImages.length === 0) {
    return [
      {
        text: buildDashScopePrompt(input.request),
      },
    ];
  }

  return [
    ...referenceImages,
    {
      text: buildDashScopePrompt(input.request),
    },
  ];
};

export const generateDashscopeQwen = async (
  input: PlatformProviderGenerateInput
): Promise<RuntimeGenerationResult> => {
  const providerModel = input.target.deployment.providerModel;
  if (!SUPPORTED_MODELS.has(providerModel)) {
    throw new ProviderError(`Unsupported DashScope Qwen model: ${providerModel}.`, 400);
  }

  const normalizedApiKey = input.credentials.apiKey?.trim() ?? "";
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
      body: JSON.stringify({
        model: providerModel,
        input: {
          messages: [
            {
              role: "user",
              content: buildQwenMessageContent(input),
            },
          ],
        },
        parameters: {
          size: toDashScopeSize(input.request),
          n: Math.min(Math.max(input.request.batchSize ?? 1, 1), 6),
          prompt_extend: resolvePromptExtend(input.request.modelParams.promptExtend),
          ...(typeof input.request.seed === "number" ? { seed: input.request.seed } : {}),
          ...(input.request.negativePrompt?.trim()
            ? { negative_prompt: input.request.negativePrompt.trim() }
            : {}),
        },
      }),
    },
    "Qwen image generation timed out.",
    context
  );

  if (!upstream.ok) {
    throw new ProviderError(
      await readProviderError(upstream, "Qwen image generation failed."),
      upstream.status
    );
  }

  const images = extractDashScopeImages((await upstream.json()) as unknown);
  if (images.length === 0) {
    throw new ProviderError("Qwen provider returned no image URL.");
  }

  return {
    modelId: input.target.frontendModel.id,
    logicalModel: input.target.frontendModel.logicalModel,
    deploymentId: input.target.deployment.id,
    runtimeProvider: input.target.provider.id,
    providerModel,
    images,
  };
};
