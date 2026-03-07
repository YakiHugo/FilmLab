import type {
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
}

export interface ImageProviderAdapter {
  generate: (
    request: ParsedImageGenerationRequest,
    apiKey: string
  ) => Promise<ProviderGenerationResult>;
}

export class ProviderError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 502, cause?: unknown) {
    super(message, cause ? { cause } : undefined);
    this.name = "ProviderError";
    this.statusCode = statusCode;
  }
}

export const toDataUrl = (bytes: ArrayBuffer, mimeType: string) =>
  `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const readProviderError = async (response: Response, fallback: string) => {
  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text().catch(() => "");
  const trimmedText = text.trim();

  if (contentType.includes("application/json") && trimmedText) {
    try {
      const json = JSON.parse(trimmedText) as unknown;
      if (isObject(json)) {
        const nestedError = isObject(json.error) ? json.error : null;
        if (nestedError && typeof nestedError.message === "string" && nestedError.message.trim()) {
          return nestedError.message;
        }
        if (typeof json.error === "string" && json.error.trim()) {
          return json.error;
        }
        if (typeof json.message === "string" && json.message.trim()) {
          return json.message;
        }
      }
    } catch {
      // Fall through to text parsing.
    }
  }

  if (trimmedText) {
    return trimmedText;
  }

  return fallback;
};
