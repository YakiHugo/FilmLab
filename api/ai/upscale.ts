import { z } from "zod";
import type { ApiRequest, ApiResponse } from "../_utils";
import { readJsonBody, sendError } from "../_utils";
import {
  imageTransformBaseSchema,
  runOpenAiImageEdit,
  sendTransformError,
} from "./_imageTransform";

const requestSchema = imageTransformBaseSchema.extend({
  scale: z.enum(["2x", "4x"]).default("2x"),
  size: z.string().default("1536x1024"),
});

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== "POST") {
    sendError(response, 405, "Method not allowed");
    return;
  }

  let payload: z.infer<typeof requestSchema>;
  try {
    payload = requestSchema.parse(await readJsonBody(request));
  } catch {
    sendError(response, 400, "Invalid request payload.");
    return;
  }

  try {
    const imageUrl = await runOpenAiImageEdit({
      model: payload.model,
      imageDataUrl: payload.imageDataUrl,
      prompt:
        payload.prompt ??
        `Upscale this image to ${payload.scale}. Keep details natural and avoid artifacts.`,
      size: payload.size,
    });
    response.status(200).json({ imageUrl });
  } catch (error) {
    sendTransformError(response, error, "AI upscale failed.");
  }
}
