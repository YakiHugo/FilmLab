import { getConfig } from "../config";
import { ProviderError } from "../providers/base/errors";
import { fetchWithTimeout } from "./fetchWithTimeout";
import {
  getImageContentType,
  readResponseBufferWithinLimit,
} from "./readResponseWithinLimit";
import { assertSafeRemoteUrl } from "./safeRemoteUrl";

const GENERATED_IMAGE_TIMEOUT_MESSAGE = "Downloading generated image timed out.";
const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 5;

const toSafeGeneratedImageUrl = async (value: string) => {
  try {
    return await assertSafeRemoteUrl(value, "Generated image");
  } catch (error) {
    if (error instanceof ProviderError) {
      throw new ProviderError(error.message, 502, error);
    }
    throw error;
  }
};

const fetchGeneratedImageResponse = async (
  imageUrl: string,
  options?: { signal?: AbortSignal }
) => {
  const deadline = Date.now() + getConfig().providerRequestTimeoutMs;
  let nextUrl = imageUrl;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const safeUrl = await toSafeGeneratedImageUrl(nextUrl);
    const remainingTimeoutMs = deadline - Date.now();
    if (remainingTimeoutMs <= 0) {
      throw new ProviderError(GENERATED_IMAGE_TIMEOUT_MESSAGE, 504);
    }

    const response = await fetchWithTimeout(
      safeUrl,
      {
        method: "GET",
        redirect: "manual",
      },
      GENERATED_IMAGE_TIMEOUT_MESSAGE,
      {
        signal: options?.signal,
        timeoutMs: remainingTimeoutMs,
      }
    );

    if (!REDIRECT_STATUS_CODES.has(response.status)) {
      return response;
    }

    const redirectLocation = response.headers.get("location");
    if (!redirectLocation) {
      throw new ProviderError("Generated image redirect location is invalid.", 502);
    }

    try {
      nextUrl = new URL(redirectLocation, safeUrl).toString();
    } catch (error) {
      throw new ProviderError("Generated image redirect location is invalid.", 502, error);
    }
  }

  throw new ProviderError("Generated image URL exceeded redirect limit.", 502);
};

export const downloadGeneratedImage = async (
  imageUrl: string,
  options?: { signal?: AbortSignal }
) => {
  const response = await fetchGeneratedImageResponse(imageUrl, options);

  if (!response.ok) {
    throw new ProviderError("Generated image could not be downloaded.", response.status);
  }

  const mimeType = getImageContentType(response, "");
  if (!mimeType) {
    throw new ProviderError("Generated image response did not contain an image.", 502);
  }

  const buffer = await readResponseBufferWithinLimit(
    response,
    getConfig().generatedImageDownloadMaxBytes,
    "Generated image is too large to cache."
  );

  return {
    buffer,
    mimeType,
  };
};
