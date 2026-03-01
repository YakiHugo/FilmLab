import { z } from "zod";
import type { ApiRequest, ApiResponse } from "../_utils";
import { readJsonBody, sendError } from "../_utils";
import {
  imageTransformBaseSchema,
  runOpenAiImageEdit,
  sendTransformError,
} from "./_imageTransform";

const requestSchema = imageTransformBaseSchema.extend({
  maskDataUrl: z.string().min(1),
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
      maskDataUrl: payload.maskDataUrl,
      prompt:
        payload.prompt ??
        "Erase the masked area and inpaint it naturally with matching texture, color, and lighting.",
      size: payload.size,
    });
    response.status(200).json({ imageUrl });
  } catch (error) {
    sendTransformError(response, error, "AI erase failed.");
  }
}
