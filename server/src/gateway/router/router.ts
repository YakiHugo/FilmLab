import type { AppConfig } from "../../config";
import type { ParsedImageGenerationRequest } from "../../shared/imageGenerationSchema";
import type { ParsedImageUpscaleRequest } from "../../shared/imageUpscaleSchema";
import { getPlatformModelAdapter } from "../../providers/base/registry";
import { ProviderError } from "../../providers/base/errors";
import { routerHealth } from "./health";
import { getRuntimeProviderConfiguration, getRuntimeProviderCredentials } from "./registry";
import { isRetriableProviderError } from "./retry";
import { selectRouteTargets } from "./selection";
import type { HealthRecordInput, ImageOperation, ResolvedRouteTarget } from "./types";

const recordResult = (input: HealthRecordInput) => {
  routerHealth.record(input);
};

const toErrorType = (error: unknown) =>
  error instanceof ProviderError ? "provider_error" : "internal_error";

const toGenerateSelectionInput = (request: ParsedImageGenerationRequest) => ({
  modelId: request.modelId,
  operation: "image.generate" as const,
  requestedTarget: request.requestedTarget,
});

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

export const createImageRuntimeRouter = (config: AppConfig) => ({
  getProviderConfiguration: (providerId: Parameters<typeof getRuntimeProviderConfiguration>[0]) =>
    getRuntimeProviderConfiguration(providerId, config),
  getHealthSnapshot: routerHealth.getSnapshot,
  getRouteTargets(request: ParsedImageGenerationRequest) {
    return selectRouteTargets(toGenerateSelectionInput(request), config);
  },
  async generate(
    request: ParsedImageGenerationRequest,
    options?: {
      signal?: AbortSignal;
      timeoutMs?: number;
      traceId?: string;
      targets?: ResolvedRouteTarget[];
      resolveRequest?: (
        target: ResolvedRouteTarget
      ) => ParsedImageGenerationRequest | Promise<ParsedImageGenerationRequest>;
    }
  ) {
    const targets = options?.targets ?? selectRouteTargets(toGenerateSelectionInput(request), config);

    return executeWithFallback("image.generate", targets, async (target) => {
      const configuredProvider = getRuntimeProviderConfiguration(target.provider.id, config);
      if (!configuredProvider.configured) {
        const message =
          target.provider.id === "kling"
            ? `${target.provider.name} access key and secret key are required.`
            : `${target.provider.name} API key is required.`;
        // 503 (not 401) so the fallback loop continues to the next target; selection
        // already filters unconfigured providers, so hitting this is a defense-in-depth
        // path (explicit targets override, or no provider configured at all).
        throw new ProviderError(message, 503);
      }

      const adapter = getPlatformModelAdapter(
        target.provider.id,
        target.deployment.providerModel
      );
      if (!adapter) {
        throw new ProviderError(
          `No adapter is registered for ${target.provider.id}/${target.deployment.providerModel}.`,
          500
        );
      }
      return adapter.generate({
        target,
        request: options?.resolveRequest ? await options.resolveRequest(target) : request,
        credentials: getRuntimeProviderCredentials(target.provider.id, config),
        options: { timeoutMs: config.providerRequestTimeoutMs, ...options },
      });
    });
  },
  async upscale(
    _request: ParsedImageUpscaleRequest,
    _payload: { imageBuffer: Buffer; mimeType: string },
    _options?: { signal?: AbortSignal; timeoutMs?: number; traceId?: string }
  ) {
    throw new ProviderError("Image upscale is not available in the model registry refactor.", 400);
  },
});
