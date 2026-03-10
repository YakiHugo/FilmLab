import { getImageModelConfig } from "../../../shared/imageProviderCatalog";
import { getConfig } from "../config";
import { fetchWithTimeout } from "../shared/fetchWithTimeout";
import { getStylePromptHint } from "../shared/imageStyleHints";
import type { ParsedImageGenerationRequest } from "../shared/imageGenerationSchema";
import type { ImageProviderAdapter, ProviderGeneratedImage } from "./types";
import { ProviderError } from "./types";
import {
  normalizeHttpProviderError,
  normalizeInvalidProviderResponseError,
  normalizeTimeoutProviderError,
} from "./errorNormalizer";

const POLL_INTERVAL_MS = 2_500;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const getKlingImageGenerationUrl = () =>
  new URL("/v1/images/generations", `${getConfig().klingApiBaseUrl}/`).toString();

const buildPrompt = (request: ParsedImageGenerationRequest) => {
  const styleHint = request.style !== "none" ? getStylePromptHint(request.style) : "";
  const parts = [request.prompt.trim()];

  if (styleHint && styleHint !== "No style hint.") {
    parts.push(`Style: ${styleHint}`);
  }

  return parts.join("\n");
};

const resolveResolution = (request: ParsedImageGenerationRequest) => {
  const value = request.modelParams.resolution;
  return value === "2k" ? "2k" : "1k";
};

const resolveWatermark = (request: ParsedImageGenerationRequest) => {
  const value = request.modelParams.watermark;
  return typeof value === "boolean" ? value : false;
};

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
    const timeoutId = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, durationMs);

    const onAbort = () => {
      clearTimeout(timeoutId);
      reject(
        normalizeTimeoutProviderError({
          message: "Kling image generation timed out.",
          provider: "kling",
        })
      );
    };

    signal?.addEventListener("abort", onAbort, { once: true });
  });

export const klingImageProvider: ImageProviderAdapter = {
  async generate(request, apiKey, options) {
    if (!getImageModelConfig("kling", request.model)) {
      throw new ProviderError(`Unsupported Kling model: ${request.model}.`, 400);
    }

    const normalizedApiKey = apiKey.trim();
    if (!normalizedApiKey) {
      throw new ProviderError("Kling API key is required.", 401);
    }

    const createResponse = await fetchWithTimeout(
      getKlingImageGenerationUrl(),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${normalizedApiKey}`,
        },
        body: JSON.stringify({
          model_name: request.model,
          prompt: buildPrompt(request),
          ...(request.negativePrompt?.trim()
            ? { negative_prompt: request.negativePrompt.trim() }
            : {}),
          n: Math.min(Math.max(request.batchSize ?? 1, 1), 9),
          aspect_ratio: request.aspectRatio,
          resolution: resolveResolution(request),
          watermark_info: {
            enabled: resolveWatermark(request),
          },
        }),
      },
      "Kling image generation timed out.",
      { ...options, provider: "kling" }
    );

    if (!createResponse.ok) {
      throw await normalizeHttpProviderError({
        response: createResponse,
        fallbackMessage: "Kling image generation failed.",
        provider: "kling",
      });
    }

    const createPayload = (await createResponse.json()) as unknown;
    if (readKlingCode(createPayload) !== 0) {
      throw normalizeInvalidProviderResponseError({
        message: readKlingErrorMessage(createPayload, "Kling image generation failed."),
        provider: "kling",
      });
    }

    const taskId = extractKlingTaskId(createPayload);
    if (!taskId) {
      throw normalizeInvalidProviderResponseError({
        message: "Kling provider did not return a task id.",
        provider: "kling",
      });
    }

    const deadline = Date.now() + getConfig().providerRequestTimeoutMs;

    while (Date.now() <= deadline) {
      const pollResponse = await fetchWithTimeout(
        `${getKlingImageGenerationUrl()}/${taskId}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${normalizedApiKey}`,
          },
        },
        "Kling image generation timed out.",
        { ...options, provider: "kling" }
      );

      if (!pollResponse.ok) {
        throw await normalizeHttpProviderError({
          response: pollResponse,
          fallbackMessage: "Kling image generation failed.",
          provider: "kling",
        });
      }

      const pollPayload = (await pollResponse.json()) as unknown;
      if (readKlingCode(pollPayload) !== 0) {
        throw normalizeInvalidProviderResponseError({
          message: readKlingErrorMessage(pollPayload, "Kling image generation failed."),
          provider: "kling",
        });
      }

      const status = readKlingTaskStatus(pollPayload);
      if (status === "succeed") {
        const images = extractKlingImages(pollPayload);
        if (images.length === 0) {
          throw normalizeInvalidProviderResponseError({
            message: "Kling provider returned no image URL.",
            provider: "kling",
          });
        }

        return {
          provider: "kling",
          model: request.model,
          images,
        };
      }

      if (status === "failed") {
        throw normalizeInvalidProviderResponseError({
          message: readKlingErrorMessage(pollPayload, "Kling image generation failed."),
          provider: "kling",
        });
      }

      await waitForPoll(options?.signal, POLL_INTERVAL_MS);
    }

    throw normalizeTimeoutProviderError({
      message: "Kling image generation timed out.",
      provider: "kling",
    });
  },
};
