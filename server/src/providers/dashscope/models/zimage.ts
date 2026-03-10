import { getConfig } from "../../../config";
import { buildDashScopePrompt, extractDashScopeImages, toDashScopeSize } from "../../dashscopeShared";
import { createProviderRequestContext, fetchProviderResponse } from "../../base/client";
import { ProviderError, readProviderError } from "../../base/errors";
import type { PlatformProviderGenerateInput, RuntimeGenerationResult } from "../../base/types";

const getDashScopeGenerationUrl = () =>
  new URL(
    "/api/v1/services/aigc/multimodal-generation/generation",
    `${getConfig().dashscopeApiBaseUrl}/`
  ).toString();

const resolvePromptExtend = (value: unknown) => (typeof value === "boolean" ? value : false);

export const generateDashscopeZImage = async (
  input: PlatformProviderGenerateInput
): Promise<RuntimeGenerationResult> => {
  const providerModel = input.target.deployment.providerModel;
  if (providerModel !== "z-image-turbo") {
    throw new ProviderError(`Unsupported DashScope Z Image model: ${providerModel}.`, 400);
  }

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
      body: JSON.stringify({
        model: providerModel,
        input: {
          messages: [
            {
              role: "user",
              content: [
                {
                  text: buildDashScopePrompt(input.request),
                },
              ],
            },
          ],
        },
        parameters: {
          size: toDashScopeSize(input.request),
          prompt_extend: resolvePromptExtend(input.request.modelParams.promptExtend),
          ...(typeof input.request.seed === "number" ? { seed: input.request.seed } : {}),
        },
      }),
    },
    "Z Image generation timed out.",
    context
  );

  if (!upstream.ok) {
    throw new ProviderError(
      await readProviderError(upstream, "Z Image generation failed."),
      upstream.status
    );
  }

  const images = extractDashScopeImages((await upstream.json()) as unknown);
  if (images.length === 0) {
    throw new ProviderError("Z Image provider returned no image URL.");
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
