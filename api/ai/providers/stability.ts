import { getImageStyleConfig } from "../../../src/lib/ai/imageStyles";
import type { ImageGenerationRequest } from "../../../src/types/imageGeneration";
import type { ImageProviderAdapter } from "../types";
import { toDataUrl } from "../types";

const toStabilityAspectRatio = (request: ImageGenerationRequest) => {
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
  if (model.includes("ultra")) {
    return "https://api.stability.ai/v2beta/stable-image/generate/ultra";
  }
  return "https://api.stability.ai/v2beta/stable-image/generate/core";
};

const buildPrompt = (request: ImageGenerationRequest) => {
  const styleHint =
    request.style && request.style !== "none"
      ? getImageStyleConfig(request.style)?.promptHint
      : "";
  return [request.prompt.trim(), styleHint ? `Style: ${styleHint}` : ""]
    .filter(Boolean)
    .join("\n");
};

export const stabilityImageProvider: ImageProviderAdapter = {
  async generate(request) {
    const apiKey = process.env.STABILITY_API_KEY;
    if (!apiKey) {
      throw new Error("STABILITY_API_KEY is not configured.");
    }

    const endpoint = toEndpoint(request.model);
    const batchSize = Math.min(Math.max(request.batchSize ?? 1, 1), 4);
    const images: Array<{ imageUrl: string; mimeType?: string }> = [];

    for (let index = 0; index < batchSize; index += 1) {
      const formData = new FormData();
      const outputFormat =
        typeof request.modelParams?.outputFormat === "string"
          ? request.modelParams.outputFormat
          : "png";
      formData.append("prompt", buildPrompt(request));
      formData.append("output_format", outputFormat);
      formData.append("aspect_ratio", toStabilityAspectRatio(request));

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
      const stylePresetFromModel =
        typeof request.modelParams?.stylePreset === "string" &&
        request.modelParams.stylePreset !== "auto"
          ? request.modelParams.stylePreset
          : null;
      if (request.stylePreset?.trim()) {
        formData.append("style_preset", request.stylePreset.trim());
      } else if (stylePresetFromModel) {
        formData.append("style_preset", stylePresetFromModel);
      } else if (request.style && request.style !== "none") {
        formData.append("style_preset", request.style.replace(/-/g, "_"));
      }

      const upstream = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "image/*",
        },
        body: formData,
      });

      if (!upstream.ok) {
        throw new Error((await upstream.text()) || "Stability image generation failed.");
      }

      const arrayBuffer = await upstream.arrayBuffer();
      images.push({
        imageUrl: toDataUrl(arrayBuffer, "image/png"),
        mimeType: "image/png",
      });
    }

    if (images.length === 0) {
      throw new Error("No image returned from Stability AI.");
    }

    return {
      provider: "stability",
      model: request.model,
      images,
    };
  },
};
