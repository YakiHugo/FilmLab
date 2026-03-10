import type {
  ImageUpscaleScale,
  ParsedImageGenerationRequest,
} from "../../shared/imageGenerationSchema";
import type { ParsedImageUpscaleRequest } from "../../shared/imageUpscaleSchema";
import type { ModelFamilyId, ProviderRouteTarget, RuntimeProviderId } from "../../gateway/router/types";

export interface ProviderGeneratedImage {
  imageUrl?: string;
  binaryData?: Buffer;
  mimeType?: string;
  revisedPrompt?: string | null;
}

export interface RuntimeGenerationResult {
  runtimeProvider: RuntimeProviderId;
  modelFamily: ModelFamilyId;
  legacyProvider: string;
  model: string;
  images: ProviderGeneratedImage[];
  warnings?: string[];
}

export interface ProviderRequestContext {
  signal?: AbortSignal;
  timeoutMs: number;
  traceId: string;
}

export interface ProviderRawResponse {
  status: number;
  payload: unknown;
  headers?: Headers;
}

export interface PlatformProviderGenerateInput {
  target: ProviderRouteTarget;
  request: ParsedImageGenerationRequest;
  apiKey: string;
  options?: { signal?: AbortSignal; timeoutMs?: number; traceId?: string };
}

export interface PlatformProviderUpscaleInput {
  target: ProviderRouteTarget;
  request: ParsedImageUpscaleRequest;
  imageBuffer: Buffer;
  mimeType: string;
  scale: ImageUpscaleScale;
  apiKey: string;
  options?: { signal?: AbortSignal; timeoutMs?: number; traceId?: string };
}
