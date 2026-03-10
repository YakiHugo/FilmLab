import { getImageModelConfig } from "../../../shared/imageProviderCatalog";
import { getConfig } from "../config";
import { fetchWithTimeout } from "../shared/fetchWithTimeout";
import { getReferenceImageWarningsForUnsupportedProvider } from "./referenceImages";
import { getStylePromptHint } from "../shared/imageStyleHints";
import type { ParsedImageGenerationRequest } from "../shared/imageGenerationSchema";
import type { ImageProviderAdapter, ProviderGeneratedImage } from "./types";
import { ProviderError, readProviderError } from "./types";

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
      reject(new ProviderError("Kling image generation timed out.", 504));
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

    const referenceWarnings = getReferenceImageWarningsForUnsupportedProvider(request, "Kling");

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
      options
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
        options
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
        const images = extractKlingImages(pollPayload);
        if (images.length === 0) {
          throw new ProviderError("Kling provider returned no image URL.");
        }

        return {
          provider: "kling",
          model: request.model,
          images,
          warnings: referenceWarnings.length > 0 ? referenceWarnings : undefined,
        };
      }

      if (status === "failed") {
        throw new ProviderError(
          readKlingErrorMessage(pollPayload, "Kling image generation failed."),
          502
        );
      }

      await waitForPoll(options?.signal, POLL_INTERVAL_MS);
    }

    throw new ProviderError("Kling image generation timed out.", 504);
  },
};
