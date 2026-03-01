import { z } from "zod";
import type { ApiResponse } from "../_utils";
import { sendError } from "../_utils";

export const IMAGE_MODEL_DEFAULT = "gpt-image-1";

export const imageTransformBaseSchema = z.object({
  provider: z.enum(["openai"]).default("openai"),
  model: z.string().default(IMAGE_MODEL_DEFAULT),
  imageDataUrl: z.string().min(1),
  prompt: z.string().optional(),
  size: z.string().optional(),
});

const dataUrlToBlob = (dataUrl: string): Blob => {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid data URL.");
  }
  const mimeType = match[1] ?? "image/png";
  const base64 = match[2] ?? "";
  const buffer = Buffer.from(base64, "base64");
  return new Blob([buffer], { type: mimeType });
};

export const sendTransformError = (response: ApiResponse, error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : fallback;
  sendError(response, 500, message || fallback);
};

export const runOpenAiImageEdit = async (params: {
  model: string;
  imageDataUrl: string;
  prompt: string;
  size?: string;
  maskDataUrl?: string;
}) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const formData = new FormData();
  formData.append("model", params.model);
  formData.append("prompt", params.prompt);
  formData.append("image", dataUrlToBlob(params.imageDataUrl), "image.png");
  if (params.maskDataUrl) {
    formData.append("mask", dataUrlToBlob(params.maskDataUrl), "mask.png");
  }
  if (params.size) {
    formData.append("size", params.size);
  }

  const upstream = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!upstream.ok) {
    throw new Error((await upstream.text()) || "OpenAI image edit failed.");
  }

  const json = (await upstream.json()) as {
    data?: Array<{ b64_json?: string; url?: string }>;
  };
  const first = json.data?.[0];
  if (!first) {
    throw new Error("No image returned from provider.");
  }
  const imageUrl =
    first.url ?? (first.b64_json ? `data:image/png;base64,${first.b64_json}` : null);
  if (!imageUrl) {
    throw new Error("Provider response missing image data.");
  }
  return imageUrl;
};
