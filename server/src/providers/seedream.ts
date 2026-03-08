import { Signer } from "@volcengine/openapi";
import { getStylePromptHint } from "../shared/imageStyleHints";
import { fetchWithTimeout } from "../shared/fetchWithTimeout";
import type { ParsedImageGenerationRequest } from "../shared/imageGenerationSchema";
import type { ImageProviderAdapter, ProviderGeneratedImage } from "./types";
import { ProviderError, readProviderError } from "./types";

const VISUAL_API_REGION = "cn-north-1";
const VISUAL_API_SERVICE = "cv";
const VISUAL_API_ACTION = "CVProcess";
const VISUAL_API_VERSION = "2022-08-31";
const VISUAL_API_URL = "https://visual.volcengineapi.com/";
const SEEDREAM_MODEL_ID = "seedream-3.0";
const SEEDREAM_REQ_KEY = "seedream_3_0_t2i";
const SEEDREAM_MAX_BATCH_SIZE = 4;
const SEEDREAM_MAX_SEED = 2_147_483_647;
const SEEDREAM_SEED_MODULUS = SEEDREAM_MAX_SEED + 1;
const DEFAULT_SCALE = 3.5;
const DEFAULT_STEPS = 25;

type VolcengineOpenApiRequest = ConstructorParameters<typeof Signer>[0];
type VolcengineCredentials = Parameters<Signer["addAuthorization"]>[0];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const toDimensions = (request: ParsedImageGenerationRequest) => {
  if (request.width && request.height) {
    return {
      width: request.width,
      height: request.height,
    };
  }

  if (request.aspectRatio === "4:3") {
    return { width: 1472, height: 1104 };
  }
  if (request.aspectRatio === "3:4") {
    return { width: 1104, height: 1472 };
  }
  if (request.aspectRatio === "3:2") {
    return { width: 1584, height: 1056 };
  }
  if (request.aspectRatio === "2:3") {
    return { width: 1056, height: 1584 };
  }
  if (request.aspectRatio === "16:9") {
    return { width: 1664, height: 936 };
  }
  if (request.aspectRatio === "9:16") {
    return { width: 936, height: 1664 };
  }
  return { width: 1328, height: 1328 };
};

const buildPrompt = (request: ParsedImageGenerationRequest) => {
  const styleHint = request.style !== "none" ? getStylePromptHint(request.style) : "";
  const parts = [request.prompt.trim()];

  if (styleHint && styleHint !== "No style hint.") {
    parts.push(`Style: ${styleHint}`);
  }

  return parts.join("\n");
};

const detectMimeType = (imageBuffer: Buffer) => {
  if (
    imageBuffer.length >= 8 &&
    imageBuffer[0] === 0x89 &&
    imageBuffer[1] === 0x50 &&
    imageBuffer[2] === 0x4e &&
    imageBuffer[3] === 0x47 &&
    imageBuffer[4] === 0x0d &&
    imageBuffer[5] === 0x0a &&
    imageBuffer[6] === 0x1a &&
    imageBuffer[7] === 0x0a
  ) {
    return "image/png";
  }

  if (imageBuffer.length >= 3 && imageBuffer[0] === 0xff && imageBuffer[1] === 0xd8) {
    return "image/jpeg";
  }

  return "image/png";
};

const parseSeedreamApiKey = (apiKey: string): VolcengineCredentials => {
  const separatorIndex = apiKey.indexOf(":");
  if (separatorIndex <= 0 || separatorIndex >= apiKey.length - 1) {
    throw new ProviderError(
      "Seedream API key must use the format AccessKeyId:SecretAccessKey.",
      400
    );
  }

  const accessKeyId = apiKey.slice(0, separatorIndex).trim();
  const secretKey = apiKey.slice(separatorIndex + 1).trim();
  if (!accessKeyId || !secretKey) {
    throw new ProviderError(
      "Seedream API key must use the format AccessKeyId:SecretAccessKey.",
      400
    );
  }

  return {
    accessKeyId,
    secretKey,
  };
};

const readBusinessErrorMessage = (payload: Record<string, unknown>) => {
  if (typeof payload.message === "string" && payload.message.trim()) {
    return payload.message.trim();
  }
  if (typeof payload.Message === "string" && payload.Message.trim()) {
    return payload.Message.trim();
  }

  const responseMetadata = isRecord(payload.ResponseMetadata) ? payload.ResponseMetadata : null;
  const nestedError = responseMetadata && isRecord(responseMetadata.Error)
    ? responseMetadata.Error
    : null;
  if (nestedError && typeof nestedError.Message === "string" && nestedError.Message.trim()) {
    return nestedError.Message.trim();
  }

  return "Seedream image generation failed.";
};

const readResponseCode = (payload: Record<string, unknown>) => {
  const candidates = [payload.code, payload.status];
  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }
    if (typeof candidate === "string" && /^\d+$/.test(candidate)) {
      return Number(candidate);
    }
  }
  return null;
};

const toFailureMessage = (error: unknown) => {
  if (error instanceof ProviderError) {
    return error.message;
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Unknown provider error.";
};

const buildPartialBatchWarning = (
  requestedCount: number,
  completedCount: number,
  errors: unknown[]
) => {
  const failedCount = Math.max(0, requestedCount - completedCount);
  const firstError = errors[0];
  const firstMessage = firstError ? toFailureMessage(firstError) : null;
  const summary =
    requestedCount > 1
      ? `Seedream returned ${completedCount} of ${requestedCount} requested images. ${failedCount} batch request${failedCount === 1 ? "" : "s"} failed.`
      : `Seedream generated an image with ${failedCount} background failure.`;

  return firstMessage ? `${summary} First error: ${firstMessage}` : summary;
};

const extractBinaryData = (payload: unknown): string[] => {
  if (!isRecord(payload)) {
    return [];
  }

  const topLevelData = isRecord(payload.data) ? payload.data : null;
  const resultPayload = isRecord(payload.Result) ? payload.Result : null;
  const nestedData = resultPayload && isRecord(resultPayload.data) ? resultPayload.data : null;
  const candidates = [
    topLevelData?.binary_data_base64,
    resultPayload?.binary_data_base64,
    nestedData?.binary_data_base64,
    payload.binary_data_base64,
  ];

  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) {
      continue;
    }
    const images = candidate.filter(
      (entry): entry is string => typeof entry === "string" && entry.trim().length > 0
    );
    if (images.length > 0) {
      return images;
    }
  }

  return [];
};

const signRequestHeaders = (
  url: URL,
  body: string,
  credentials: VolcengineCredentials
): Record<string, string> => {
  const signRequest: VolcengineOpenApiRequest = {
    region: VISUAL_API_REGION,
    method: "POST",
    pathname: url.pathname,
    params: {
      Action: VISUAL_API_ACTION,
      Version: VISUAL_API_VERSION,
    },
    headers: {
      Host: url.host,
      "Content-Type": "application/json",
    },
    body,
  };

  const signer = new Signer(signRequest, VISUAL_API_SERVICE);
  signer.addAuthorization(credentials);
  return signRequest.headers as Record<string, string>;
};

const generateSingle = async (
  body: Record<string, unknown>,
  credentials: VolcengineCredentials,
  options?: { signal?: AbortSignal }
) => {
  const url = new URL(VISUAL_API_URL);
  url.searchParams.set("Action", VISUAL_API_ACTION);
  url.searchParams.set("Version", VISUAL_API_VERSION);

  const requestBody = JSON.stringify(body);
  const headers = signRequestHeaders(url, requestBody, credentials);
  const upstream = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers,
      body: requestBody,
    },
    "Seedream image generation timed out.",
    options
  );

  if (!upstream.ok) {
    throw new ProviderError(
      await readProviderError(upstream, "Seedream image generation failed."),
      upstream.status
    );
  }

  const json = (await upstream.json()) as unknown;
  if (!isRecord(json)) {
    throw new ProviderError("Seedream provider returned an invalid response.");
  }

  const responseCode = readResponseCode(json);
  if (responseCode !== null && responseCode !== 0 && responseCode !== 10_000) {
    throw new ProviderError(readBusinessErrorMessage(json));
  }

  const images = extractBinaryData(json).map<ProviderGeneratedImage>((entry) => {
    const binaryData = Buffer.from(entry, "base64");
    return {
      binaryData,
      mimeType: detectMimeType(binaryData),
    };
  });

  if (images.length === 0) {
    throw new ProviderError("Seedream provider returned no image data.");
  }

  return images;
};

export const seedreamImageProvider: ImageProviderAdapter = {
  async generate(request, apiKey, options) {
    if (request.model !== SEEDREAM_MODEL_ID) {
      throw new ProviderError(`Unsupported Seedream model: ${request.model}.`, 400);
    }

    const credentials = parseSeedreamApiKey(apiKey);
    const batchSize = Math.min(Math.max(request.batchSize ?? 1, 1), SEEDREAM_MAX_BATCH_SIZE);
    const { width, height } = toDimensions(request);
    const baseSeed = typeof request.seed === "number" ? request.seed : -1;
    const baseBody = {
      req_key: SEEDREAM_REQ_KEY,
      prompt: buildPrompt(request),
      width,
      height,
      scale: typeof request.guidanceScale === "number" ? request.guidanceScale : DEFAULT_SCALE,
      ddim_steps: typeof request.steps === "number" ? request.steps : DEFAULT_STEPS,
      ...(request.negativePrompt?.trim()
        ? { negative_prompt: request.negativePrompt.trim() }
        : {}),
    };

    // Seedream's Visual API request example is single-shot, so batch generation fans out
    // to multiple signed requests while preserving the shared batch-size contract.
    const settledImages = await Promise.allSettled(
      Array.from({ length: batchSize }, async (_, index) =>
        generateSingle(
          {
            ...baseBody,
            seed:
              baseSeed >= 0 ? (baseSeed + index) % SEEDREAM_SEED_MODULUS : -1,
          },
          credentials,
          options
        )
      )
    );

    const images = settledImages.reduce<ProviderGeneratedImage[]>((accumulator, result) => {
      if (result.status === "fulfilled") {
        accumulator.push(...result.value);
      }
      return accumulator;
    }, []);
    const failedResults = settledImages.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected"
    );

    if (images.length === 0) {
      const firstRejected = failedResults[0]?.reason;
      if (firstRejected instanceof ProviderError) {
        throw firstRejected;
      }
      throw new ProviderError("Seedream provider returned no images.");
    }

    const warnings =
      failedResults.length > 0
        ? [
            buildPartialBatchWarning(
              batchSize,
              settledImages.length - failedResults.length,
              failedResults.map((result) => result.reason)
            ),
          ]
        : undefined;

    return {
      provider: "seedream",
      model: request.model,
      images: images.slice(0, batchSize),
      warnings,
    };
  },
};

export default seedreamImageProvider;
