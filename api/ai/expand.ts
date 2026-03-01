import { z } from "zod";
import type { ApiRequest, ApiResponse } from "../_utils";
import { readJsonBody, sendError } from "../_utils";
import {
  imageTransformBaseSchema,
  runOpenAiImageEdit,
  sendTransformError,
} from "./_imageTransform";

const requestSchema = imageTransformBaseSchema.extend({
  targetAspectRatio: z.enum(["1:1", "4:5", "5:4", "16:9", "9:16", "3:2", "2:3"]).default("3:2"),
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
        `Outpaint this image to aspect ratio ${payload.targetAspectRatio}. Extend scene content naturally and preserve subject consistency.`,
      size: payload.size,
    });
    response.status(200).json({ imageUrl });
  } catch (error) {
    sendTransformError(response, error, "AI expand failed.");
  }
}
