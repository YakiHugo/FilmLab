import { getImageModelConfig } from "../../../shared/imageProviderCatalog";
import { getConfig } from "../config";
import { fetchWithTimeout } from "../shared/fetchWithTimeout";
import type { ParsedImageGenerationRequest } from "../shared/imageGenerationSchema";
import {
  createProviderAdapter,
  toProviderRawResponse,
  type ProviderProtocol,
} from "./protocol";
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

const resolvePromptExtend = (request: ParsedImageGenerationRequest) => {
  const value = request.modelParams.promptExtend;
  return typeof value === "boolean" ? value : false;
};

interface ZImageBuildRequest {
  request: ParsedImageGenerationRequest;
  apiKey: string;
  url: string;
  body: Record<string, unknown>;
}

export const zImageProtocol: ProviderProtocol<
  ParsedImageGenerationRequest,
  ZImageBuildRequest,
  Response,
  ReturnType<typeof toProviderRawResponse>
> = {
  buildRequest(request, apiKey) {
    if (!getImageModelConfig("zimage", request.model)) {
      throw new ProviderError(`Unsupported Z Image model: ${request.model}.`, 400);
    }

    const normalizedApiKey = apiKey.trim();
    if (!normalizedApiKey) {
      throw new ProviderError("DashScope API key is required.", 401);
    }

    return {
      request,
      apiKey: normalizedApiKey,
      url: getDashScopeGenerationUrl(),
      body: {
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
      },
    };
  },
  async execute(buildRequest, context) {
    const upstream = await fetchWithTimeout(
      buildRequest.url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${buildRequest.apiKey}`,
        },
        body: JSON.stringify(buildRequest.body),
      },
      "Z Image generation timed out.",
      {
        signal: context.signal,
        timeoutMs: context.timeoutMs,
      }
    );

    if (!upstream.ok) {
      throw new ProviderError(
        await readProviderError(upstream, "Z Image generation failed."),
        upstream.status
      );
    }

    return upstream;
  },
  async poll(executeResponse) {
    const json = (await executeResponse.json()) as unknown;
    return toProviderRawResponse(executeResponse, json);
  },
  normalizeResult({ request, rawResponse }) {
    const images = extractDashScopeImages(rawResponse.payload);
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

export const zImageProvider = createProviderAdapter(zImageProtocol);
