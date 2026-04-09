import type {
  FrontendImageModelCatalogEntry,
  ImageModelCatalogResponse,
} from "../../../shared/imageModelCatalog";
import type { AppConfig } from "../config";
import { getFrontendImageModels } from "../models/frontendRegistry";
import {
  getDefaultDeploymentForModel,
  getRuntimeProviderConfiguration,
  getRuntimeProviders,
} from "../gateway/router/registry";
import { routerHealth } from "../gateway/router/health";
import type { HealthRecordInput } from "../gateway/router/types";
import type { ProviderHealthSnapshot } from "./healthStore";

const toHealthState = (
  health: ProviderHealthSnapshot
): FrontendImageModelCatalogEntry["health"]["state"] => {
  if (health.sampleSize === 0) {
    return "unknown";
  }
  if (health.circuitOpen || health.successRate < 0.5) {
    return "down";
  }
  if (health.score < 80 || health.successRate < 0.8) {
    return "degraded";
  }
  return "healthy";
};

const toCatalogHealth = (health: ProviderHealthSnapshot): FrontendImageModelCatalogEntry["health"] => ({
  state: toHealthState(health),
  score: health.score,
  successRate: health.successRate,
  averageLatencyMs: health.averageLatencyMs,
  sampleSize: health.sampleSize,
  circuitOpen: health.circuitOpen,
  lastErrorType: health.lastErrorType,
  updatedAt: health.lastFailureAt ?? health.circuitOpenedAt,
});

export const createImageModelCatalogRegistry = (config: AppConfig, health = routerHealth) => ({
  getCatalog(now = Date.now()): ImageModelCatalogResponse {
    const providers = getRuntimeProviders().map((provider) => {
      const configuration = getRuntimeProviderConfiguration(provider.id, config);
      return {
        id: provider.id,
        name: provider.name,
        configured: configuration.configured,
        missingCredential: configuration.missingCredential,
      };
    });

    const models = getFrontendImageModels()
      .filter((model) => model.visible && model.capability === "image.generate")
      .map((model) => {
        const deployment = getDefaultDeploymentForModel(model.id);
        if (!deployment) {
          throw new Error(`Missing deployment for frontend model ${model.id}.`);
        }

        const configuration = getRuntimeProviderConfiguration(deployment.provider, config);
        const modelHealth = health.getSnapshot(
          deployment.provider,
          deployment.providerModel,
          "image.generate",
          now
        );

        return {
          id: model.id,
          label: model.label,
          logicalModel: model.logicalModel,
          modelFamily: model.modelFamily,
          capability: model.capability,
          description: model.description,
          visible: model.visible,
          constraints: model.constraints,
          parameterDefinitions: model.parameterDefinitions,
          defaults: model.defaults,
          promptCompiler: model.promptCompiler,
          supportsUpscale: model.supportsUpscale,
          defaultProvider: deployment.provider,
          deploymentId: deployment.id,
          providerModel: deployment.providerModel,
          configured: configuration.configured,
          health: toCatalogHealth(modelHealth),
        } satisfies FrontendImageModelCatalogEntry;
      });

    return {
      generatedAt: new Date(now).toISOString(),
      providers,
      models,
    };
  },
  recordProviderCallResult(input: HealthRecordInput) {
    health.record(input);
  },
});

