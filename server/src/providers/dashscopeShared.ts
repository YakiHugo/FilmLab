import { getStylePromptHint } from "../shared/imageStyleHints";
import type { ParsedImageGenerationRequest } from "../shared/imageGenerationSchema";
import { ProviderError } from "./base/errors";
import type { ProviderGeneratedImage } from "./base/types";

const DASHSCOPE_SIZE_BY_ASPECT_RATIO: Record<
  Exclude<ParsedImageGenerationRequest["aspectRatio"], "custom">,
  { width: number; height: number }
> = {
  "1:1": { width: 1024, height: 1024 },
  "16:9": { width: 1536, height: 864 },
  "9:16": { width: 864, height: 1536 },
  "4:3": { width: 1536, height: 1152 },
  "3:4": { width: 1152, height: 1536 },
  "3:2": { width: 1536, height: 1024 },
  "2:3": { width: 1024, height: 1536 },
  "21:9": { width: 1680, height: 720 },
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const getDimensionPair = (request: ParsedImageGenerationRequest) => {
  if (request.width && request.height) {
    return {
      width: request.width,
      height: request.height,
    };
  }

  if (request.aspectRatio === "custom") {
    return {
      width: 1024,
      height: 1024,
    };
  }

  return DASHSCOPE_SIZE_BY_ASPECT_RATIO[request.aspectRatio];
};

export const buildDashScopePrompt = (request: ParsedImageGenerationRequest) => {
  const styleHint = request.style !== "none" ? getStylePromptHint(request.style) : "";
  const parts = [request.prompt.trim()];

  if (styleHint && styleHint !== "No style hint.") {
    parts.push(`Style: ${styleHint}`);
  }

  return parts.join("\n");
};

export const toDashScopeSize = (request: ParsedImageGenerationRequest) => {
  const { width, height } = getDimensionPair(request);
  const pixels = width * height;

  if (pixels < 512 * 512 || pixels > 2048 * 2048) {
    throw new ProviderError(
      "DashScope image size must stay between 512x512 and 2048x2048 total pixels.",
      400
    );
  }

  return `${width}*${height}`;
};

const getChoiceMessage = (choice: unknown) => {
  if (!isRecord(choice)) {
    return null;
  }

  return isRecord(choice.message) ? choice.message : null;
};

const extractFromChoices = (payload: Record<string, unknown>): ProviderGeneratedImage[] => {
  const output = isRecord(payload.output) ? payload.output : null;
  const choices = Array.isArray(output?.choices) ? output.choices : [];

  return choices.reduce<ProviderGeneratedImage[]>((images, choice) => {
    const message = getChoiceMessage(choice);
    const content = Array.isArray(message?.content) ? message.content : [];
    let imageUrl: string | null = null;
    let revisedPrompt: string | null = null;

    for (const item of content) {
      if (!isRecord(item)) {
        continue;
      }

      if (!imageUrl && typeof item.image === "string" && item.image.trim()) {
        imageUrl = item.image.trim();
      }
      if (!revisedPrompt && typeof item.text === "string" && item.text.trim()) {
        revisedPrompt = item.text.trim();
      }
    }

    if (!imageUrl) {
      return images;
    }

    images.push({
      imageUrl,
      revisedPrompt,
    });
    return images;
  }, []);
};

const extractFromResults = (payload: Record<string, unknown>): ProviderGeneratedImage[] => {
  const output = isRecord(payload.output) ? payload.output : null;
  const results = Array.isArray(output?.results) ? output.results : [];

  return results.reduce<ProviderGeneratedImage[]>((images, result) => {
    if (!isRecord(result) || typeof result.url !== "string" || !result.url.trim()) {
      return images;
    }

    images.push({
      imageUrl: result.url.trim(),
      revisedPrompt:
        typeof result.actual_prompt === "string" && result.actual_prompt.trim()
          ? result.actual_prompt.trim()
          : null,
    });
    return images;
  }, []);
};

export const extractDashScopeImages = (payload: unknown): ProviderGeneratedImage[] => {
  if (!isRecord(payload)) {
    return [];
  }

  const fromChoices = extractFromChoices(payload);
  if (fromChoices.length > 0) {
    return fromChoices;
  }

  return extractFromResults(payload);
};
