import type {
  ParsedImageGenerationRequest,
} from "../../shared/imageGenerationSchema";
import type { ParsedImageUpscaleRequest } from "../../shared/imageUpscaleSchema";
import type { FrontendImageModelId, LogicalImageModelId } from "../../../../shared/imageModelCatalog";
import type { ResolvedRouteTarget, RuntimeProviderId } from "../../gateway/router/types";
import type { ImageUpscaleScale } from "../../../../shared/imageGeneration";
import type { ResolvedProviderInputAsset } from "../../assets/types";

export interface ProviderGeneratedImage {
  imageUrl?: string;
  binaryData?: Buffer;
  mimeType?: string;
  revisedPrompt?: string | null;
}

export interface RuntimeGenerationResult {
  modelId: FrontendImageModelId;
  logicalModel: LogicalImageModelId;
  deploymentId: string;
  runtimeProvider: RuntimeProviderId;
  providerModel: string;
  providerRequestId?: string;
  providerTaskId?: string;
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
  baseUrl: string;
}

export interface PlatformProviderGenerateInput {
  target: ResolvedRouteTarget;
  request: ParsedImageGenerationRequest & {
    resolvedInputAssets?: ResolvedProviderInputAsset[];
  };
  credentials: RuntimeProviderCredentials;
  options: { signal?: AbortSignal; timeoutMs: number; traceId?: string };
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
