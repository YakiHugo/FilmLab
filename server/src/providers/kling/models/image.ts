import { getStylePromptHint } from "../../../shared/imageStyleHints";
import { createProviderRequestContext, fetchProviderResponse, toProviderRawResponse } from "../../base/client";
import { ProviderError, readProviderError } from "../../base/errors";
import type {
  PlatformProviderGenerateInput,
  ProviderGeneratedImage,
  ProviderRawResponse,
  RuntimeGenerationResult,
} from "../../base/types";
import { resolveKlingBearerToken } from "../auth";

const POLL_INTERVAL_MS = 2_500;
const SUPPORTED_MODELS = new Set(["kling-v2-1", "kling-v3"]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const getKlingImageGenerationUrl = (baseUrl: string) =>
  new URL("/v1/images/generations", `${baseUrl}/`).toString();

const buildPrompt = (prompt: string, style: Parameters<typeof getStylePromptHint>[0]) => {
  const styleHint = style !== "none" ? getStylePromptHint(style) : "";
  const parts = [prompt.trim()];

  if (styleHint && styleHint !== "No style hint.") {
    parts.push(`Style: ${styleHint}`);
  }

  return parts.join("\n");
};

const resolveResolution = (value: unknown) => (value === "2k" ? "2k" : "1k");
const resolveWatermark = (value: unknown) => (typeof value === "boolean" ? value : false);

const readKlingErrorMessage = (payload: unknown, fallback: string) => {
  if (!isRecord(payload)) {
    return fallback;
  }

  if (typeof payload.message === "string" && payload.message.trim()) {
    return payload.message.trim();
  }

  if (isRecord(payload.data) && typeof payload.data.task_status_msg === "string") {
    const message = payload.data.task_status_msg.trim();
    if (message) {
      return message;
    }
  }

  return fallback;
};

const extractKlingTaskId = (payload: unknown) => {
  if (!isRecord(payload) || !isRecord(payload.data)) {
    return null;
  }

  return typeof payload.data.task_id === "string" && payload.data.task_id.trim()
    ? payload.data.task_id.trim()
    : null;
};

const readKlingCode = (payload: unknown) => {
  if (!isRecord(payload)) {
    return 0;
  }

  return typeof payload.code === "number" ? payload.code : 0;
};

const readKlingTaskStatus = (payload: unknown) => {
  if (!isRecord(payload) || !isRecord(payload.data)) {
    return null;
  }

  return typeof payload.data.task_status === "string" && payload.data.task_status.trim()
    ? payload.data.task_status.trim()
    : null;
};

const extractKlingImages = (payload: unknown): ProviderGeneratedImage[] => {
  if (!isRecord(payload) || !isRecord(payload.data) || !isRecord(payload.data.task_result)) {
    return [];
  }

  const images = Array.isArray(payload.data.task_result.images)
    ? payload.data.task_result.images
    : [];

  return images.reduce<ProviderGeneratedImage[]>((results, image) => {
    if (!isRecord(image)) {
      return results;
    }

    const imageUrl =
      typeof image.url === "string" && image.url.trim()
        ? image.url.trim()
        : typeof image.watermark_url === "string" && image.watermark_url.trim()
          ? image.watermark_url.trim()
          : null;

    if (!imageUrl) {
      return results;
    }

    results.push({ imageUrl });
    return results;
  }, []);
};

const waitForPoll = (signal: AbortSignal | undefined, durationMs: number) =>
  new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timeoutId);
      reject(new ProviderError("Kling image generation timed out.", 504));
    };

    const timeoutId = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, durationMs);

    signal?.addEventListener("abort", onAbort, { once: true });
  });

const pollKlingTask = async (
  taskId: string,
  bearerToken: string,
  baseUrl: string,
  context: ReturnType<typeof createProviderRequestContext>
): Promise<ProviderRawResponse> => {
  const deadline = Date.now() + context.timeoutMs;

  while (Date.now() <= deadline) {
    const remainingTimeoutMs = deadline - Date.now();
    if (remainingTimeoutMs <= 0) {
      break;
    }

    const pollResponse = await fetchProviderResponse(
      `${getKlingImageGenerationUrl(baseUrl)}/${taskId}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${bearerToken}`,
        },
      },
      "Kling image generation timed out.",
      {
        ...context,
        timeoutMs: remainingTimeoutMs,
      }
    );

    if (!pollResponse.ok) {
      throw new ProviderError(
        await readProviderError(pollResponse, "Kling image generation failed."),
        pollResponse.status
      );
    }

    const pollPayload = (await pollResponse.json()) as unknown;
    if (readKlingCode(pollPayload) !== 0) {
      throw new ProviderError(
        readKlingErrorMessage(pollPayload, "Kling image generation failed."),
        502
      );
    }

    const status = readKlingTaskStatus(pollPayload);
    if (status === "succeed") {
      return toProviderRawResponse(pollResponse, pollPayload);
    }

    if (status === "failed") {
      throw new ProviderError(
        readKlingErrorMessage(pollPayload, "Kling image generation failed."),
        502
      );
    }

    await waitForPoll(context.signal, Math.min(POLL_INTERVAL_MS, remainingTimeoutMs));
  }

  throw new ProviderError("Kling image generation timed out.", 504);
};

export const generateKlingImage = async (
  input: PlatformProviderGenerateInput
): Promise<RuntimeGenerationResult> => {
  const providerModel = input.target.deployment.providerModel;
  if (!SUPPORTED_MODELS.has(providerModel)) {
    throw new ProviderError(`Unsupported Kling model: ${providerModel}.`, 400);
  }

  const bearerToken = resolveKlingBearerToken(input.credentials);
  const baseUrl = input.credentials.baseUrl;
  const context = createProviderRequestContext(input.options);
  const createResponse = await fetchProviderResponse(
    getKlingImageGenerationUrl(baseUrl),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${bearerToken}`,
      },
      body: JSON.stringify({
        model_name: providerModel,
        prompt: buildPrompt(input.request.prompt, input.request.style),
        ...(input.request.negativePrompt?.trim()
          ? { negative_prompt: input.request.negativePrompt.trim() }
          : {}),
        n: Math.min(Math.max(input.request.batchSize ?? 1, 1), 9),
        aspect_ratio: input.request.aspectRatio,
        resolution: resolveResolution(input.request.modelParams.resolution),
        watermark_info: {
          enabled: resolveWatermark(input.request.modelParams.watermark),
        },
      }),
    },
    "Kling image generation timed out.",
    context
  );

  if (!createResponse.ok) {
    throw new ProviderError(
      await readProviderError(createResponse, "Kling image generation failed."),
      createResponse.status
    );
  }

  const createPayload = (await createResponse.json()) as unknown;
  if (readKlingCode(createPayload) !== 0) {
    throw new ProviderError(
      readKlingErrorMessage(createPayload, "Kling image generation failed."),
      502
    );
  }

  const taskId = extractKlingTaskId(createPayload);
  if (!taskId) {
    throw new ProviderError("Kling provider did not return a task id.");
  }

  const rawResponse = await pollKlingTask(taskId, bearerToken, baseUrl, context);
  const images = extractKlingImages(rawResponse.payload);
  if (images.length === 0) {
    throw new ProviderError("Kling provider returned no image URL.");
  }

  return {
    modelId: input.target.frontendModel.id,
    logicalModel: input.target.frontendModel.logicalModel,
    deploymentId: input.target.deployment.id,
    runtimeProvider: input.target.provider.id,
    providerModel,
    providerTaskId: taskId,
    images,
  };
};
