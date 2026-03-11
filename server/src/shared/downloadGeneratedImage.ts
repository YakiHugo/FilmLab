import { getConfig } from "../config";
import { ProviderError } from "../providers/base/errors";
import { fetchWithTimeout } from "./fetchWithTimeout";
import {
  getImageContentType,
  readResponseBufferWithinLimit,
} from "./readResponseWithinLimit";

export const downloadGeneratedImage = async (
  imageUrl: string,
  options?: { signal?: AbortSignal }
) => {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(imageUrl);
  } catch (error) {
    throw new ProviderError("Generated image URL is invalid.", 502, error);
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new ProviderError("Generated image URL must use HTTP or HTTPS.", 502);
  }

  const response = await fetchWithTimeout(
    parsedUrl,
    {
      method: "GET",
      redirect: "follow",
    },
    "Downloading generated image timed out.",
    options
  );

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
