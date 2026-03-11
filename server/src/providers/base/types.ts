import type {
  ParsedImageGenerationRequest,
} from "../../shared/imageGenerationSchema";
import type { ParsedImageUpscaleRequest } from "../../shared/imageUpscaleSchema";
import type { FrontendImageModelId, ImageDeploymentId, LogicalImageModelId } from "../../../../shared/imageModelCatalog";
import type { ResolvedRouteTarget, RuntimeProviderId } from "../../gateway/router/types";
import type { ImageUpscaleScale } from "../../../../shared/imageGeneration";

export interface ProviderGeneratedImage {
  imageUrl?: string;
  binaryData?: Buffer;
  mimeType?: string;
  revisedPrompt?: string | null;
}

export interface RuntimeGenerationResult {
  modelId: FrontendImageModelId;
  logicalModel: LogicalImageModelId;
  deploymentId: ImageDeploymentId;
  runtimeProvider: RuntimeProviderId;
  providerModel: string;
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

export interface RuntimeProviderCredentials {
  apiKey?: string;
  accessKey?: string;
  secretKey?: string;
}

export interface PlatformProviderGenerateInput {
  target: ResolvedRouteTarget;
  request: ParsedImageGenerationRequest;
  credentials: RuntimeProviderCredentials;
  options?: { signal?: AbortSignal; timeoutMs?: number; traceId?: string };
}

export interface PlatformProviderUpscaleInput {
  target: ResolvedRouteTarget;
  request: ParsedImageUpscaleRequest;
  imageBuffer: Buffer;
  mimeType: string;
  scale: ImageUpscaleScale;
  credentials: RuntimeProviderCredentials;
  options?: { signal?: AbortSignal; timeoutMs?: number; traceId?: string };
}
