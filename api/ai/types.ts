import type {
  ImageGenerationRequest,
  ImageProviderId,
} from "../../src/types/imageGeneration";

export interface ProviderGeneratedImage {
  imageUrl: string;
  mimeType?: string;
  revisedPrompt?: string | null;
}

export interface ProviderGenerationResult {
  provider: ImageProviderId;
  model: string;
  images: ProviderGeneratedImage[];
}

export interface ImageProviderAdapter {
  generate: (payload: ImageGenerationRequest) => Promise<ProviderGenerationResult>;
}

export const toDataUrl = (bytes: ArrayBuffer, mimeType: string) =>
  `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`;
