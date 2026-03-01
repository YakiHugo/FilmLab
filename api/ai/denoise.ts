import { z } from "zod";
import type { ApiRequest, ApiResponse } from "../_utils";
import { readJsonBody, sendError } from "../_utils";
import {
  imageTransformBaseSchema,
  runOpenAiImageEdit,
  sendTransformError,
} from "./_imageTransform";

const requestSchema = imageTransformBaseSchema.extend({
  strength: z.number().min(0).max(1).default(0.65),
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
        `Denoise this image at strength ${payload.strength.toFixed(
          2
        )}. Preserve edges and texture while removing luminance and chroma noise.`,
      size: payload.size,
    });
    response.status(200).json({ imageUrl });
  } catch (error) {
    sendTransformError(response, error, "AI denoise failed.");
  }
}
