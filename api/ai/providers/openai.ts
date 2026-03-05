import { getImageStyleConfig } from "../../../src/lib/ai/imageStyles";
import type { ImageGenerationRequest } from "../../../src/types/imageGeneration";
import type { ImageProviderAdapter } from "../types";

const toOpenAiSize = (request: ImageGenerationRequest) => {
  if (request.aspectRatio === "9:16" || request.aspectRatio === "2:3" || request.aspectRatio === "3:4") {
    return "1024x1536";
  }
  if (request.aspectRatio === "16:9" || request.aspectRatio === "3:2" || request.aspectRatio === "4:3") {
    return "1536x1024";
  }
  return "1024x1024";
};

const buildPrompt = (request: ImageGenerationRequest) => {
  const styleHint =
    request.style && request.style !== "none"
      ? getImageStyleConfig(request.style)?.promptHint
      : "";
  const parts = [request.prompt.trim()];
  if (styleHint) {
    parts.push(`Style: ${styleHint}`);
  }
  if (request.negativePrompt && request.negativePrompt.trim()) {
    parts.push(`Avoid: ${request.negativePrompt.trim()}`);
  }
  if (request.modelParams && Object.keys(request.modelParams).length > 0) {
    const modelParamPrompt = Object.entries(request.modelParams)
      .map(([key, value]) => `${key}: ${String(value)}`)
      .join(", ");
    parts.push(`Model hints: ${modelParamPrompt}`);
  }
  return parts.join("\n");
};

export const openAiImageProvider: ImageProviderAdapter = {
  async generate(request) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not configured.");
    }

    const upstream = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: request.model,
        prompt: buildPrompt(request),
        size: toOpenAiSize(request),
        n: Math.min(Math.max(request.batchSize ?? 1, 1), 4),
      }),
    });

    if (!upstream.ok) {
      throw new Error((await upstream.text()) || "OpenAI image generation failed.");
    }

    const json = (await upstream.json()) as {
      data?: Array<{ b64_json?: string; url?: string; revised_prompt?: string }>;
    };

    const images = (json.data ?? [])
      .map((entry) => {
        if (entry.url) {
          return {
            imageUrl: entry.url,
            revisedPrompt: entry.revised_prompt ?? null,
          };
        }
        if (entry.b64_json) {
          return {
            imageUrl: `data:image/png;base64,${entry.b64_json}`,
            revisedPrompt: entry.revised_prompt ?? null,
          };
        }
        return null;
      })
      .filter((entry): entry is { imageUrl: string; revisedPrompt: string | null } => Boolean(entry));

    if (images.length === 0) {
      throw new Error("No image returned from OpenAI.");
    }

    return {
      provider: "openai",
      model: request.model,
      images,
    };
  },
};
