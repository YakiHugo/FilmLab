import type { ParsedImageGenerationRequest } from "../../shared/imageGenerationSchema";
import type { ParsedImageUpscaleRequest } from "../../shared/imageUpscaleSchema";
import { getPlatformProviderAdapter } from "../../providers/base/registry";
import { ProviderError } from "../../providers/base/errors";
import { routerHealth } from "./health";
import { getRuntimeProviderConfiguration, getRuntimeProviderKey } from "./registry";
import { isRetriableProviderError } from "./retry";
import { selectRouteTargets } from "./selection";
import type { HealthRecordInput, ImageOperation } from "./types";

const recordResult = (input: HealthRecordInput) => {
  routerHealth.record(input);
};

const toErrorType = (error: unknown) =>
  error instanceof ProviderError ? "provider_error" : "internal_error";

const executeWithFallback = async <T>(
  operation: ImageOperation,
  targets: ReturnType<typeof selectRouteTargets>,
  handler: (target: (typeof targets)[number]) => Promise<T>
) => {
  let lastError: unknown = null;

  for (const target of targets) {
    const startedAt = Date.now();
    try {
      const result = await handler(target);
      recordResult({
        provider: target.provider.id,
        model: target.deployment.providerModel,
        operation,
        success: true,
        latencyMs: Date.now() - startedAt,
      });
      return result;
    } catch (error) {
      lastError = error;
      recordResult({
        provider: target.provider.id,
        model: target.deployment.providerModel,
        operation,
        success: false,
        latencyMs: Date.now() - startedAt,
        errorType: toErrorType(error),
      });

      if (!isRetriableProviderError(error)) {
        throw error;
      }
    }
  }

  throw lastError ?? new ProviderError(`${operation} failed.`);
};

export const imageRuntimeRouter = {
  getProviderConfiguration: getRuntimeProviderConfiguration,
  getHealthSnapshot: routerHealth.getSnapshot,
  async generate(
    request: ParsedImageGenerationRequest,
    options?: { signal?: AbortSignal; timeoutMs?: number; traceId?: string }
  ) {
    const targets = selectRouteTargets({
      modelId: request.modelId,
      capability: "image.generate",
    });

    return executeWithFallback("generate", targets, async (target) => {
      const configuredProvider = getRuntimeProviderConfiguration(target.provider.id);
      if (!configuredProvider.configured) {
        throw new ProviderError(`${target.provider.name} API key is required.`, 401);
      }

      const adapter = getPlatformProviderAdapter(target.provider.id);
      return adapter.generate({
        target,
        request,
        apiKey: getRuntimeProviderKey(target.provider.id),
        options,
      });
    });
  },
  async upscale(
    request: ParsedImageUpscaleRequest,
    payload: { imageBuffer: Buffer; mimeType: string },
    options?: { signal?: AbortSignal; timeoutMs?: number; traceId?: string }
  ) {
    throw new ProviderError("Image upscale is not available in the model registry refactor.", 400);
  },
};
