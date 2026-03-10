import type { PlatformProviderAdapter } from "../base/adapter";
import { ProviderError } from "../base/errors";
import { generateKlingImage } from "./models/image";

export const klingProvider: PlatformProviderAdapter = {
  async generate(input) {
    switch (input.target.deployment.providerModel) {
      case "kling-v2-1":
      case "kling-v3":
        return generateKlingImage(input);
      default:
        throw new ProviderError(
          `Unsupported Kling model: ${input.target.deployment.providerModel}.`,
          400
        );
    }
  },
};
