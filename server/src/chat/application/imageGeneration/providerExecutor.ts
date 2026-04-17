import type { AppConfig } from "../../../config";
import { createImageRuntimeRouter } from "../../../gateway/router/router";
import type { ResolvedRouteTarget } from "../../../gateway/router/types";
import type { ParsedImageGenerationRequest } from "../../../shared/imageGenerationSchema";

type RuntimeRouter = ReturnType<typeof createImageRuntimeRouter>;
type GenerateOptions = Parameters<RuntimeRouter["generate"]>[1];
export type ImageGenerationResult = Awaited<ReturnType<RuntimeRouter["generate"]>>;

export class ProviderExecutor {
  private readonly router: RuntimeRouter;

  constructor(deps: { config: AppConfig }) {
    this.router = createImageRuntimeRouter(deps.config);
  }

  getRouteTargets(request: ParsedImageGenerationRequest): ResolvedRouteTarget[] {
    return this.router.getRouteTargets(request);
  }

  async generate(
    request: ParsedImageGenerationRequest,
    options: GenerateOptions
  ): Promise<ImageGenerationResult> {
    return this.router.generate(request, options);
  }
}
