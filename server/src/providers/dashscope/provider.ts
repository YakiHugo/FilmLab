import type { PlatformProviderAdapter } from "../base/adapter";
import { ProviderError } from "../base/errors";
import { generateDashscopeQwen } from "./models/qwen";
import { generateDashscopeZImage } from "./models/zimage";

export const dashscopeProvider: PlatformProviderAdapter = {
  async generate(input) {
    switch (input.target.deployment.providerModel) {
      case "qwen-image-2.0-pro":
      case "qwen-image-2.0":
        return generateDashscopeQwen(input);
      case "z-image-turbo":
        return generateDashscopeZImage(input);
      default:
        throw new ProviderError(
          `Unsupported DashScope model: ${input.target.deployment.providerModel}.`,
          400
        );
    }
  },
};
