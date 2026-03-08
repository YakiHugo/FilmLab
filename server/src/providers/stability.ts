import { getStylePromptHint } from "../shared/imageStyleHints";
import { fetchWithTimeout } from "../shared/fetchWithTimeout";
import type { ParsedImageGenerationRequest } from "../shared/imageGenerationSchema";
import type { ImageProviderAdapter, ProviderImageUpscaleRequest } from "./types";
import { ProviderError, readProviderError } from "./types";

const toStabilityAspectRatio = (request: ParsedImageGenerationRequest) => {
  switch (request.aspectRatio) {
    case "16:9":
      return "16:9";
    case "9:16":
      return "9:16";
    case "3:2":
      return "3:2";
    case "2:3":
      return "2:3";
    case "1:1":
      return "1:1";
    default:
      throw new ProviderError(
        `Stability AI does not support aspect ratio ${request.aspectRatio}.`,
        400
      );
  }
};

const toEndpoint = (model: string) => {
  if (model === "stable-image-ultra") {
    return new URL("https://api.stability.ai/v2beta/stable-image/generate/ultra");
  }

  if (model === "sd3-large") {
    return new URL("https://api.stability.ai/v2beta/stable-image/generate/sd3");
  }

  if (model === "stable-image-core") {
    return new URL("https://api.stability.ai/v2beta/stable-image/generate/core");
  }

  throw new ProviderError(`Unsupported Stability AI model: ${model}.`, 400);
};

const buildPrompt = (request: ParsedImageGenerationRequest) => {
  const styleHint = request.style !== "none" ? getStylePromptHint(request.style) : "";

  return [
    request.prompt.trim(),
    styleHint && styleHint !== "No style hint." ? `Style: ${styleHint}` : "",
  ]
    .filter(Boolean)
    .join("\n");
};

const toMimeType = (outputFormat: string) => {
  if (outputFormat === "jpeg") return "image/jpeg";
  if (outputFormat === "webp") return "image/webp";
  return "image/png";
};

const toOutputFormat = (mimeType: string) => {
  if (mimeType.includes("jpeg")) return "jpeg";
  if (mimeType.includes("webp")) return "webp";
  return "png";
};

const toFileExtension = (mimeType: string) => {
  if (mimeType.includes("jpeg")) return "jpg";
  if (mimeType.includes("webp")) return "webp";
  return "png";
};

const resolveUpscaleEndpoint = (scale: ProviderImageUpscaleRequest["scale"]) => {
  if (scale === "2x") {
    return new URL("https://api.stability.ai/v2beta/stable-image/upscale/fast");
  }

  throw new ProviderError(
    `Stability AI upscale scale "${scale}" is not supported by the configured provider endpoint.`,
    400
  );
};

const buildUpscaleFormData = (request: ProviderImageUpscaleRequest) => {
  const formData = new FormData();
  const outputFormat = toOutputFormat(request.mimeType);
  const imageBytes = new Uint8Array(
    request.imageBuffer.buffer,
    request.imageBuffer.byteOffset,
    request.imageBuffer.byteLength
  );
  const imageFile = new Blob([imageBytes as unknown as BlobPart], {
    type: request.mimeType || toMimeType(outputFormat),
  });

  formData.append("image", imageFile, `upscale-source.${toFileExtension(request.mimeType)}`);
  formData.append("output_format", outputFormat);
  return {
    formData,
    mimeType: toMimeType(outputFormat),
  };
};

export const stabilityImageProvider: ImageProviderAdapter = {
  async generate(request, apiKey, options) {
    const endpoint = toEndpoint(request.model);
    const batchSize = Math.min(Math.max(request.batchSize ?? 1, 1), 4);
    const outputFormat =
      typeof request.modelParams.outputFormat === "string"
        ? request.modelParams.outputFormat
        : "png";
    const stylePreset =
      request.stylePreset?.trim() ||
      (typeof request.modelParams.stylePreset === "string" &&
      request.modelParams.stylePreset !== "auto"
        ? request.modelParams.stylePreset
        : request.style !== "none"
          ? request.style.replace(/-/g, "_")
          : "");

    const settledImages = await Promise.allSettled(
      Array.from({ length: batchSize }, async (_, index) => {
        const formData = new FormData();
        formData.append("prompt", buildPrompt(request));
        formData.append("output_format", outputFormat);
        formData.append("aspect_ratio", toStabilityAspectRatio(request));

        if (request.model === "sd3-large") {
          formData.append("model", request.model);
        }

        if (request.negativePrompt?.trim()) {
          formData.append("negative_prompt", request.negativePrompt.trim());
        }
        if (typeof request.seed === "number") {
          formData.append("seed", String(request.seed + index));
        }
        if (typeof request.guidanceScale === "number") {
          formData.append("cfg_scale", String(request.guidanceScale));
        }
        if (typeof request.steps === "number") {
          formData.append("steps", String(request.steps));
        }
        if (stylePreset) {
          formData.append("style_preset", stylePreset);
        }

        const upstream = await fetchWithTimeout(
          endpoint,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              Accept: "image/*",
            },
            body: formData,
          },
          "Stability image generation timed out.",
          options
        );

        if (!upstream.ok) {
          throw new ProviderError(
            await readProviderError(upstream, "Stability image generation failed."),
            upstream.status
          );
        }

        const arrayBuffer = await upstream.arrayBuffer();
        const mimeType = toMimeType(outputFormat);
        return {
          binaryData: Buffer.from(arrayBuffer),
          mimeType,
        };
      })
    );
    const images = settledImages.reduce<Array<{ binaryData: Buffer; mimeType: string }>>(
      (results, result) => {
        if (result.status === "fulfilled") {
          results.push(result.value);
        }
        return results;
      },
      []
    );

    if (images.length === 0) {
      const firstRejected = settledImages.find(
        (result): result is PromiseRejectedResult => result.status === "rejected"
      )?.reason;
      if (firstRejected instanceof ProviderError) {
        throw firstRejected;
      }
      throw new ProviderError("Stability AI returned no images.");
    }

    return {
      provider: "stability",
      model: request.model,
      images,
    };
  },
  async upscale(request, apiKey, options) {
    const endpoint = resolveUpscaleEndpoint(request.scale);
    const { formData, mimeType } = buildUpscaleFormData(request);

    const upstream = await fetchWithTimeout(
      endpoint,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "image/*",
        },
        body: formData,
      },
      "Stability image upscale timed out.",
      options
    );

    if (!upstream.ok) {
      throw new ProviderError(
        await readProviderError(upstream, "Stability image upscale failed."),
        upstream.status
      );
    }

    const arrayBuffer = await upstream.arrayBuffer();
    return {
      binaryData: Buffer.from(arrayBuffer),
      mimeType,
    };
  },
};
