import type { ImageProviderId } from "../shared/imageGenerationSchema";
import { ProviderError, type ProviderErrorCode } from "./types";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const inferCodeFromStatus = (status: number): ProviderErrorCode => {
  if (status === 401 || status === 403) {
    return "PROVIDER_AUTH";
  }
  if (status === 429) {
    return "PROVIDER_RATE_LIMIT";
  }
  return "PROVIDER_UPSTREAM";
};

export const readProviderErrorMessage = async (response: Response, fallback: string) => {
  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text().catch(() => "");
  const trimmedText = text.trim();

  if (contentType.includes("application/json") && trimmedText) {
    try {
      const json = JSON.parse(trimmedText) as unknown;
      if (isRecord(json)) {
        const nestedError = isRecord(json.error) ? json.error : null;
        if (nestedError && typeof nestedError.message === "string" && nestedError.message.trim()) {
          return nestedError.message;
        }
        if (typeof json.error === "string" && json.error.trim()) {
          return json.error;
        }
        if (typeof json.message === "string" && json.message.trim()) {
          return json.message;
        }
      }
    } catch {
      // Fall through to text parsing.
    }
  }

  return trimmedText || fallback;
};

export const normalizeHttpProviderError = async (params: {
  response: Response;
  fallbackMessage: string;
  provider: ImageProviderId;
}) => {
  const { response, fallbackMessage, provider } = params;
  const message = await readProviderErrorMessage(response, fallbackMessage);
  const code = inferCodeFromStatus(response.status);

  return new ProviderError(message, {
    code,
    provider,
    statusCode: response.status,
    upstreamStatus: response.status,
    retryable: code === "PROVIDER_RATE_LIMIT" || response.status >= 500,
  });
};

export const normalizeInvalidProviderResponseError = (params: {
  message: string;
  provider: ImageProviderId;
  cause?: unknown;
}) =>
  new ProviderError(params.message, {
    code: "PROVIDER_RESPONSE_INVALID",
    provider: params.provider,
    statusCode: 502,
    retryable: false,
    cause: params.cause,
  });

export const normalizeTimeoutProviderError = (params: {
  message: string;
  provider: ImageProviderId;
  cause?: unknown;
}) =>
  new ProviderError(params.message, {
    code: "PROVIDER_TIMEOUT",
    provider: params.provider,
    statusCode: 504,
    retryable: true,
    cause: params.cause,
  });

export const normalizeProviderRequestError = (params: {
  error: unknown;
  fallbackMessage: string;
  timeoutMessage: string;
  provider?: ImageProviderId;
}) => {
  const { error, fallbackMessage, timeoutMessage, provider } = params;

  if (error instanceof ProviderError) {
    return error;
  }

  if (error instanceof Error && error.name === "AbortError") {
    return new ProviderError(timeoutMessage, {
      code: "PROVIDER_TIMEOUT",
      provider,
      statusCode: 504,
      retryable: true,
      cause: error,
    });
  }

  return new ProviderError(fallbackMessage, {
    code: "PROVIDER_UPSTREAM",
    provider,
    statusCode: 502,
    retryable: true,
    cause: error,
  });
};
