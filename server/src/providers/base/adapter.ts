import type { ImageProviderId } from "../../../../shared/imageGeneration";
import type {
  ProviderGeneratedImage,
  PlatformProviderGenerateInput,
  PlatformProviderUpscaleInput,
  RuntimeGenerationResult,
} from "./types";

export interface PlatformModelAdapter {
  provider: ImageProviderId;
  providerModel: string;
  transport: "sdk" | "openai_compatible" | "http";
  generate: (input: PlatformProviderGenerateInput) => Promise<RuntimeGenerationResult>;
  upscale?: (input: PlatformProviderUpscaleInput) => Promise<ProviderGeneratedImage>;
}
