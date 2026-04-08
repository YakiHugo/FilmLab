import type { ImageProviderId } from "../../../../shared/imageGeneration";
import type { ProviderModelId } from "../../../../shared/imageModelCatalog";
import type {
  ProviderGeneratedImage,
  PlatformProviderGenerateInput,
  PlatformProviderUpscaleInput,
  RuntimeGenerationResult,
} from "./types";

export interface PlatformModelAdapter {
  provider: ImageProviderId;
  providerModel: ProviderModelId;
  transport: "sdk" | "openai_compatible" | "http";
  generate: (input: PlatformProviderGenerateInput) => Promise<RuntimeGenerationResult>;
  upscale?: (input: PlatformProviderUpscaleInput) => Promise<ProviderGeneratedImage>;
}
