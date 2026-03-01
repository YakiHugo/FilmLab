import { z } from "zod";
import type { ApiRequest, ApiResponse } from "../_utils";
import { readJsonBody, sendError } from "../_utils";
import {
  imageTransformBaseSchema,
  runOpenAiImageEdit,
  sendTransformError,
} from "./_imageTransform";

const requestSchema = imageTransformBaseSchema.extend({
  strength: z.number().min(0).max(1).default(0.55),
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
        `Sharpen this image at strength ${payload.strength.toFixed(
          2
        )}. Enhance edge clarity without halos or oversharpening.`,
      size: payload.size,
    });
    response.status(200).json({ imageUrl });
  } catch (error) {
    sendTransformError(response, error, "AI sharpen failed.");
  }
}
