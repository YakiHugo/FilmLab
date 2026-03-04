import { type ApiRequest, type ApiResponse, readJsonBody, sendError } from "./_utils";
import { imageGenerationRequestSchema } from "../src/lib/ai/imageGenerationSchema";
import type { ImageProviderId } from "../src/types/imageGeneration";
import { fluxImageProvider } from "./ai/providers/flux";
import { openAiImageProvider } from "./ai/providers/openai";
import { stabilityImageProvider } from "./ai/providers/stability";
import type { ImageProviderAdapter } from "./ai/types";

const PROVIDER_ADAPTERS: Record<ImageProviderId, ImageProviderAdapter> = {
  openai: openAiImageProvider,
  stability: stabilityImageProvider,
  flux: fluxImageProvider,
};

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== "POST") {
    sendError(response, 405, "Method not allowed");
    return;
  }

  let payload: ReturnType<typeof imageGenerationRequestSchema.parse>;
  try {
    payload = imageGenerationRequestSchema.parse(await readJsonBody(request));
  } catch {
    sendError(response, 400, "Invalid request payload.");
    return;
  }

  try {
    const adapter = PROVIDER_ADAPTERS[payload.provider];
    if (!adapter) {
      sendError(response, 400, `Unsupported provider: ${payload.provider}`);
      return;
    }

    const generated = await adapter.generate(payload);
    const firstImageUrl = generated.images[0]?.imageUrl;
    if (!firstImageUrl) {
      throw new Error("Provider did not return any image.");
    }

    response.status(200).json({
      provider: generated.provider,
      model: generated.model,
      createdAt: new Date().toISOString(),
      imageUrl: firstImageUrl,
      images: generated.images.map((image) => ({
        imageUrl: image.imageUrl,
        provider: generated.provider,
        model: generated.model,
        mimeType: image.mimeType,
        revisedPrompt: image.revisedPrompt,
      })),
    });
  } catch (error) {
    sendError(response, 500, error instanceof Error ? error.message : "Image generation failed.");
  }
}
