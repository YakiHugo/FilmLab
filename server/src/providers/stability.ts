import { getStylePromptHint } from "../shared/imageStyleHints";
import { fetchWithTimeout } from "../shared/fetchWithTimeout";
import type { ParsedImageGenerationRequest } from "../shared/imageGenerationSchema";
import type { ImageProviderAdapter } from "./types";
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
    case "4:3":
      return "3:2";
    case "3:4":
      return "2:3";
    default:
      return "1:1";
  }
};

const toEndpoint = (model: string) => {
  if (model === "stable-image-ultra") {
    return new URL("https://api.stability.ai/v2beta/stable-image/generate/ultra");
  }

  if (model === "sd3-large") {
    return new URL("https://api.stability.ai/v2beta/stable-image/generate/sd3");
  }

  return new URL("https://api.stability.ai/v2beta/stable-image/generate/core");
};

const buildPrompt = (request: ParsedImageGenerationRequest) => {
  const styleHint =
    request.style !== "none" ? getStylePromptHint(request.style) : "";

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

export const stabilityImageProvider: ImageProviderAdapter = {
  async generate(request, apiKey) {
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
          "Stability image generation timed out."
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
};
