import type {
  ImageUpscaleScale,
  ImageProviderId,
  ParsedImageGenerationRequest,
} from "../shared/imageGenerationSchema";

export interface ProviderGeneratedImage {
  imageUrl?: string;
  binaryData?: Buffer;
  mimeType?: string;
  revisedPrompt?: string | null;
}

export interface ProviderGenerationResult {
  provider: ImageProviderId;
  model: string;
  images: ProviderGeneratedImage[];
  warnings?: string[];
}

export interface ProviderImageUpscaleRequest {
  model: string;
  imageBuffer: Buffer;
  mimeType: string;
  scale: ImageUpscaleScale;
}

export interface ImageProviderAdapter {
  generate: (
    request: ParsedImageGenerationRequest,
    apiKey: string,
    options?: { signal?: AbortSignal }
  ) => Promise<ProviderGenerationResult>;
  upscale?: (
    request: ProviderImageUpscaleRequest,
    apiKey: string,
    options?: { signal?: AbortSignal }
  ) => Promise<ProviderGeneratedImage>;
}

export type ProviderErrorCode =
  | "PROVIDER_AUTH"
  | "PROVIDER_RATE_LIMIT"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_RESPONSE_INVALID"
  | "PROVIDER_UPSTREAM";

interface ProviderErrorOptions {
  statusCode?: number;
  code?: ProviderErrorCode;
  provider?: ImageProviderId;
  upstreamStatus?: number;
  retryable?: boolean;
  cause?: unknown;
}

export class ProviderError extends Error {
  statusCode: number;
  code: ProviderErrorCode;
  provider?: ImageProviderId;
  upstreamStatus?: number;
  retryable: boolean;

  constructor(message: string, statusCode?: number, cause?: unknown);
  constructor(message: string, options?: ProviderErrorOptions);
  constructor(message: string, statusOrOptions: number | ProviderErrorOptions = 502, cause?: unknown) {
    const options: ProviderErrorOptions =
      typeof statusOrOptions === "number"
        ? { statusCode: statusOrOptions, cause }
        : statusOrOptions;

    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = "ProviderError";
    this.statusCode = options.statusCode ?? 502;
    this.code = options.code ?? "PROVIDER_UPSTREAM";
    this.provider = options.provider;
    this.upstreamStatus = options.upstreamStatus;
    this.retryable = options.retryable ?? this.statusCode >= 500;
  }
}

export const toDataUrl = (bytes: ArrayBuffer, mimeType: string) =>
  `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`;
