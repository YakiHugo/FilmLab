export const IMAGE_PROVIDER_IDS = ["openai", "stability", "flux", "ideogram", "seedream"] as const;
export type ImageProviderId = (typeof IMAGE_PROVIDER_IDS)[number];

export const IMAGE_ASPECT_RATIOS = [
  "1:1",
  "16:9",
  "9:16",
  "4:3",
  "3:4",
  "3:2",
  "2:3",
  "custom",
] as const;
export type ImageAspectRatio = (typeof IMAGE_ASPECT_RATIOS)[number];

export const IMAGE_STYLE_IDS = [
  "photorealistic",
  "cinematic",
  "anime",
  "digital-art",
  "oil-painting",
  "watercolor",
  "sketch",
  "3d-render",
  "pixel-art",
  "none",
] as const;
export type ImageStyleId = (typeof IMAGE_STYLE_IDS)[number];

export const REFERENCE_IMAGE_TYPES = ["style", "content", "controlnet"] as const;
export type ReferenceImageType = (typeof REFERENCE_IMAGE_TYPES)[number];

export const IMAGE_UPSCALE_SCALES = ["2x", "4x"] as const;
export type ImageUpscaleScale = (typeof IMAGE_UPSCALE_SCALES)[number];

export interface ReferenceImage {
  id: string;
  url: string;
  fileName?: string;
  weight?: number;
  type: ReferenceImageType;
}

export interface ImageGenerationRequest {
  prompt: string;
  negativePrompt?: string;
  provider: ImageProviderId;
  model: string;
  aspectRatio: ImageAspectRatio;
  width?: number;
  height?: number;
  style?: ImageStyleId;
  stylePreset?: string;
  referenceImages?: ReferenceImage[];
  seed?: number;
  guidanceScale?: number;
  steps?: number;
  sampler?: string;
  batchSize?: number;
  modelParams?: Record<string, string | number | boolean | null>;
}

export interface GeneratedImage {
  imageUrl: string;
  imageId?: string;
  provider: ImageProviderId;
  model: string;
  mimeType?: string;
  revisedPrompt?: string | null;
}

export interface ImageUpscaleRequest {
  provider: ImageProviderId;
  model: string;
  imageId: string;
  scale?: ImageUpscaleScale;
}

export interface ImageGenerationResponse {
  provider: ImageProviderId;
  model: string;
  createdAt: string;
  imageId?: string;
  imageUrl?: string;
  images: GeneratedImage[];
  warnings?: string[];
}
