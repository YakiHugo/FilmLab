import type { ImageGenStage } from "../../../../shared/imageGeneration";

export type ProviderErrorOptions = {
  stage?: ImageGenStage;
  providerErrorCode?: string;
  providerId?: string;
  modelId?: string;
  responseStatus?: number;
  responseBodyPreview?: string;
};

export class ProviderError extends Error {
  statusCode: number;
  stage?: ImageGenStage;
  providerErrorCode?: string;
  providerId?: string;
  modelId?: string;
  responseStatus?: number;
  responseBodyPreview?: string;

  constructor(
    message: string,
    statusCode = 502,
    cause?: unknown,
    options?: ProviderErrorOptions
  ) {
    super(message, cause ? { cause } : undefined);
    this.name = "ProviderError";
    this.statusCode = statusCode;
    this.stage = options?.stage;
    this.providerErrorCode = options?.providerErrorCode;
    this.providerId = options?.providerId;
    this.modelId = options?.modelId;
    this.responseStatus = options?.responseStatus;
    this.responseBodyPreview = options?.responseBodyPreview;
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const extractErrorMessage = (trimmedText: string, contentType: string, fallback: string) => {
  if (contentType.includes("application/json") && trimmedText) {
    try {
      const json = JSON.parse(trimmedText) as unknown;
      if (isObject(json)) {
        const nestedError = isObject(json.error) ? json.error : null;
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

  if (trimmedText) {
    return trimmedText;
  }

  return fallback;
};

export const readProviderError = async (response: Response, fallback: string) => {
  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text().catch(() => "");
  return extractErrorMessage(text.trim(), contentType, fallback);
};

export const createProviderResponseError = async (
  response: Response,
  fallback: string,
  options?: Pick<ProviderErrorOptions, "stage" | "providerErrorCode">
): Promise<ProviderError> => {
  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text().catch(() => "");
  const trimmedText = text.trim();
  const message = extractErrorMessage(trimmedText, contentType, fallback);
  return new ProviderError(message, response.status, undefined, {
    ...options,
    responseStatus: response.status,
    responseBodyPreview: trimmedText.slice(0, 200),
  });
};
