import { getConfig } from "../config";
import { dataUrlToBlob, extensionFromMimeType, isDataUrl } from "../shared/dataUrl";
import { fetchWithTimeout } from "../shared/fetchWithTimeout";
import type {
  ImageAspectRatio,
  ParsedImageGenerationRequest,
} from "../shared/imageGenerationSchema";
import {
  getImageContentType,
  readResponseBufferWithinLimit,
} from "../shared/readResponseWithinLimit";
import { assertSafeRemoteUrl } from "../shared/safeRemoteUrl";
import type { ImageProviderAdapter } from "./types";
import { ProviderError, readProviderError } from "./types";

const toIdeogramAspectRatio = (aspectRatio: ImageAspectRatio) => {
  if (aspectRatio === "custom") {
    return "1x1";
  }
  return aspectRatio.replace(":", "x");
};

const toStyleType = (style: ParsedImageGenerationRequest["style"]) => {
  switch (style) {
    case "photorealistic":
    case "cinematic":
      return "REALISTIC";
    case "digital-art":
    case "3d-render":
      return "DESIGN";
    case "anime":
    case "oil-painting":
    case "watercolor":
    case "sketch":
    case "pixel-art":
      return "FICTION";
    default:
      return "AUTO";
  }
};

const toReferenceBlob = async (url: string, options?: { signal?: AbortSignal }) => {
  if (isDataUrl(url)) {
    return dataUrlToBlob(url);
  }

  const safeUrl = await assertSafeRemoteUrl(url, "Ideogram reference image");
  const response = await fetchWithTimeout(
    safeUrl,
      {
        method: "GET",
        redirect: "error",
      },
      "Downloading a reference image for Ideogram timed out.",
      options
    );

  if (!response.ok) {
    throw new ProviderError("Ideogram reference image could not be downloaded.", response.status);
  }

  const contentType = getImageContentType(response, "");
  if (!contentType) {
    throw new ProviderError("Ideogram reference image URL did not return an image.", 400);
  }

  const buffer = await readResponseBufferWithinLimit(
    response,
    getConfig().referenceImageDownloadMaxBytes,
    "Ideogram reference image is too large to download."
  );
  return new Blob([buffer], { type: contentType });
};

const appendReferenceImages = async (
  formData: FormData,
  request: ParsedImageGenerationRequest,
  options?: { signal?: AbortSignal }
) => {
  const styleReferences = request.referenceImages.filter((entry) => entry.type === "style");
  const styleBlobs = await Promise.all(
    styleReferences.map(async (entry) => ({
      entry,
      blob: await toReferenceBlob(entry.url, options),
    }))
  );

  for (const { entry, blob } of styleBlobs) {
    const extension = extensionFromMimeType(blob.type);
    formData.append(
      "style_reference_images",
      blob,
      entry.fileName ?? `style-reference.${extension}`
    );
  }

  const characterReference = request.referenceImages.find((entry) => entry.type !== "style");
  if (characterReference) {
    const blob = await toReferenceBlob(characterReference.url, options);
    const extension = extensionFromMimeType(blob.type);
    formData.append(
      "character_reference_images",
      blob,
      characterReference.fileName ?? `character-reference.${extension}`
    );
  }
};

export const ideogramImageProvider: ImageProviderAdapter = {
  async generate(request, apiKey, options) {
    const batchSize = Math.min(Math.max(request.batchSize ?? 1, 1), 4);
    const renderingSpeed =
      typeof request.modelParams.renderingSpeed === "string"
        ? request.modelParams.renderingSpeed
        : "TURBO";
    const magicPrompt =
      typeof request.modelParams.magicPrompt === "string"
        ? request.modelParams.magicPrompt
        : "AUTO";

    const formData = new FormData();
    formData.append("prompt", request.prompt.trim());
    formData.append("aspect_ratio", toIdeogramAspectRatio(request.aspectRatio));
    formData.append("rendering_speed", renderingSpeed);
    formData.append("magic_prompt", magicPrompt);
    formData.append("num_images", String(batchSize));
    formData.append("style_type", toStyleType(request.style));

    if (request.negativePrompt?.trim()) {
      formData.append("negative_prompt", request.negativePrompt.trim());
    }
    if (typeof request.seed === "number") {
      formData.append("seed", String(request.seed));
    }

    await appendReferenceImages(formData, request, options);

    const upstream = await fetchWithTimeout(
      "https://api.ideogram.ai/v1/ideogram-v3/generate",
      {
        method: "POST",
        headers: {
          "Api-Key": apiKey,
        },
        body: formData,
      },
      "Ideogram image generation timed out.",
      options
    );

    if (!upstream.ok) {
      throw new ProviderError(
        await readProviderError(upstream, "Ideogram image generation failed."),
        upstream.status
      );
    }

    const json = (await upstream.json()) as {
      data?: Array<{ url?: string; seed?: number }>;
    };
    const images = (json.data ?? [])
      .map((entry) => (typeof entry.url === "string" ? { imageUrl: entry.url } : null))
      .filter((entry): entry is { imageUrl: string } => Boolean(entry));

    if (images.length === 0) {
      throw new ProviderError("No image returned from Ideogram.");
    }

    return {
      provider: "ideogram",
      model: request.model,
      images,
    };
  },
};
