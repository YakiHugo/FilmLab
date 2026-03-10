import { getConfig } from "../../config";
import { getStylePromptHint } from "../../shared/imageStyleHints";
import type { PlatformProviderAdapter } from "../base/adapter";
import { createProviderRequestContext, fetchProviderResponse, toProviderRawResponse } from "../base/client";
import { ProviderError, readProviderError } from "../base/errors";
import type { ProviderRawResponse } from "../base/types";

const POLL_INTERVAL_MS = 2_500;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const getKlingImageGenerationUrl = () =>
  new URL("/v1/images/generations", `${getConfig().klingApiBaseUrl}/`).toString();

const buildPrompt = (
  prompt: string,
  style: Parameters<typeof getStylePromptHint>[0]
) => {
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

const extractKlingImages = (payload: unknown) => {
  if (!isRecord(payload) || !isRecord(payload.data) || !isRecord(payload.data.task_result)) {
    return [];
  }

  const images = Array.isArray(payload.data.task_result.images)
    ? payload.data.task_result.images
    : [];

  return images.reduce<Array<{ imageUrl: string }>>((results, image) => {
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
  apiKey: string,
  context: ReturnType<typeof createProviderRequestContext>
): Promise<ProviderRawResponse> => {
  const deadline = Date.now() + context.timeoutMs;

  while (Date.now() <= deadline) {
    const pollResponse = await fetchProviderResponse(
      `${getKlingImageGenerationUrl()}/${taskId}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      },
      "Kling image generation timed out.",
      context
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

    await waitForPoll(context.signal, POLL_INTERVAL_MS);
  }

  throw new ProviderError("Kling image generation timed out.", 504);
};

export const klingPlatformAdapter: PlatformProviderAdapter = {
  async generate(input) {
    const normalizedApiKey = input.apiKey.trim();
    if (!normalizedApiKey) {
      throw new ProviderError("Kling API key is required.", 401);
    }

    const context = createProviderRequestContext(input.options);
    const createResponse = await fetchProviderResponse(
      getKlingImageGenerationUrl(),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${normalizedApiKey}`,
        },
        body: JSON.stringify({
          model_name: input.request.model,
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

    const rawResponse = await pollKlingTask(taskId, normalizedApiKey, context);
    const images = extractKlingImages(rawResponse.payload);
    if (images.length === 0) {
      throw new ProviderError("Kling provider returned no image URL.");
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
