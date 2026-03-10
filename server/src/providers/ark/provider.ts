import type { PlatformProviderAdapter } from "../base/adapter";
import { ProviderError } from "../base/errors";
import { generateArkSeedream } from "./models/seedream";

export const arkProvider: PlatformProviderAdapter = {
  async generate(input) {
    switch (input.target.deployment.providerModel) {
      case "doubao-seedream-5-0-260128":
      case "doubao-seedream-4-0-250828":
        return generateArkSeedream(input);
      default:
        throw new ProviderError(
          `Unsupported Ark model: ${input.target.deployment.providerModel}.`,
          400
        );
    }
  },
};
