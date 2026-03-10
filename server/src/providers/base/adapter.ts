import type { ProviderGeneratedImage, PlatformProviderGenerateInput, PlatformProviderUpscaleInput, RuntimeGenerationResult } from "./types";

export interface PlatformProviderAdapter {
  generate: (input: PlatformProviderGenerateInput) => Promise<RuntimeGenerationResult>;
  upscale?: (input: PlatformProviderUpscaleInput) => Promise<ProviderGeneratedImage>;
}
