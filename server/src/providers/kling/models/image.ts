import { z } from "zod";
import { getStylePromptHint } from "../../../shared/imageStyleHints";
import { createProviderRequestContext, fetchProviderResponse } from "../../base/client";
import { ProviderError, readProviderError } from "../../base/errors";
import type {
  PlatformProviderGenerateInput,
  ProviderGeneratedImage,
  RuntimeGenerationResult,
} from "../../base/types";
import { resolveKlingBearerToken } from "../auth";

const POLL_INTERVAL_MS = 2_500;
const SUPPORTED_MODELS = new Set(["kling-v2-1", "kling-v3"]);

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

const klingImageItemSchema = z.object({
  url: z.string().optional(),
  watermark_url: z.string().optional(),
});

const klingResponseSchema = z.object({
  code: z.number().optional(),
  message: z.string().optional(),
  data: z
    .object({
      task_id: z.string().optional(),
      task_status: z.string().optional(),
      task_status_msg: z.string().optional(),
      task_result: z
        .object({
          images: z.array(klingImageItemSchema).optional(),
        })
        .optional(),
    })
    .optional(),
});

type KlingResponse = z.infer<typeof klingResponseSchema>;

const parseKlingResponse = (payload: unknown): KlingResponse => {
  const parsed = klingResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new ProviderError("Kling provider returned an invalid response.", 502);
  }
  return parsed.data;
};

const readKlingErrorMessage = (payload: KlingResponse, fallback: string) => {
  if (payload.message && payload.message.trim()) {
    return payload.message.trim();
  }

  const taskStatusMsg = payload.data?.task_status_msg?.trim();
  if (taskStatusMsg) {
    return taskStatusMsg;
  }

  return fallback;
};

const extractKlingImages = (payload: KlingResponse): ProviderGeneratedImage[] =>
  (payload.data?.task_result?.images ?? []).reduce<ProviderGeneratedImage[]>(
    (results, image) => {
      const imageUrl =
        image.url && image.url.trim()
          ? image.url.trim()
          : image.watermark_url && image.watermark_url.trim()
            ? image.watermark_url.trim()
            : null;

      if (!imageUrl) {
        return results;
      }

      results.push({ imageUrl });
      return results;
    },
    []
  );

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
): Promise<KlingResponse> => {
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

    const pollPayload = parseKlingResponse(await pollResponse.json());
    if ((pollPayload.code ?? 0) !== 0) {
      throw new ProviderError(
        readKlingErrorMessage(pollPayload, "Kling image generation failed."),
        502
      );
    }

    const status = pollPayload.data?.task_status?.trim();
    if (status === "succeed") {
      return pollPayload;
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

  const createPayload = parseKlingResponse(await createResponse.json());
  if ((createPayload.code ?? 0) !== 0) {
    throw new ProviderError(
      readKlingErrorMessage(createPayload, "Kling image generation failed."),
      502
    );
  }

  const taskId = createPayload.data?.task_id?.trim();
  if (!taskId) {
    throw new ProviderError("Kling provider did not return a task id.");
  }

  const pollPayload = await pollKlingTask(taskId, bearerToken, baseUrl, context);
  const images = extractKlingImages(pollPayload);
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
