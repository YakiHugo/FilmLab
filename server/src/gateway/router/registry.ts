import { getConfig } from "../../config";
import type { FrontendImageModelId } from "../../../../shared/imageModelCatalog";
import { getFrontendImageModelById } from "../../models/frontendRegistry";
import type {
  DeploymentSpec,
  ProviderSpec,
  ResolvedRouteTarget,
  RouterSelectionInput,
  RuntimeProviderId,
} from "./types";
import type { RuntimeProviderCredentials } from "../../providers/base/types";

const PROVIDERS: ProviderSpec[] = [
  {
    id: "ark",
    name: "Ark",
    credentialSlot: "ark",
    operations: ["generate", "upscale"],
    healthScope: "model_operation",
  },
  {
    id: "dashscope",
    name: "DashScope",
    credentialSlot: "dashscope",
    operations: ["generate", "upscale"],
    healthScope: "model_operation",
  },
  {
    id: "kling",
    name: "Kling",
    credentialSlot: "kling",
    operations: ["generate", "upscale"],
    healthScope: "model_operation",
  },
];

const DEPLOYMENTS: DeploymentSpec[] = [
  {
    id: "ark-seedream-v5-primary",
    logicalModel: "image.seedream.v5",
    provider: "ark",
    providerModel: "doubao-seedream-5-0-260128",
    capability: "image.generate",
    enabled: true,
    priority: 100,
  },
  {
    id: "ark-seedream-v4-primary",
    logicalModel: "image.seedream.v4",
    provider: "ark",
    providerModel: "doubao-seedream-4-0-250828",
    capability: "image.generate",
    enabled: true,
    priority: 100,
  },
  {
    id: "dashscope-qwen-image-2-pro-primary",
    logicalModel: "image.qwen.v2.pro",
    provider: "dashscope",
    providerModel: "qwen-image-2.0-pro",
    capability: "image.generate",
    enabled: true,
    priority: 100,
  },
  {
    id: "dashscope-qwen-image-2-primary",
    logicalModel: "image.qwen.v2",
    provider: "dashscope",
    providerModel: "qwen-image-2.0",
    capability: "image.generate",
    enabled: true,
    priority: 100,
  },
  {
    id: "dashscope-zimage-turbo-primary",
    logicalModel: "image.zimage.turbo",
    provider: "dashscope",
    providerModel: "z-image-turbo",
    capability: "image.generate",
    enabled: true,
    priority: 100,
  },
  {
    id: "kling-kling-v2-1-primary",
    logicalModel: "image.kling.v2_1",
    provider: "kling",
    providerModel: "kling-v2-1",
    capability: "image.generate",
    enabled: true,
    priority: 100,
  },
  {
    id: "kling-kling-v3-primary",
    logicalModel: "image.kling.v3",
    provider: "kling",
    providerModel: "kling-v3",
    capability: "image.generate",
    enabled: true,
    priority: 100,
  },
];

const providersById = new Map(PROVIDERS.map((provider) => [provider.id, provider]));
const deploymentsByLogicalCapability = DEPLOYMENTS.reduce(
  (accumulator, deployment) => {
    const key = `${deployment.logicalModel}:${deployment.capability}`;
    const current = accumulator.get(key) ?? [];
    current.push(deployment);
    accumulator.set(
      key,
      current.sort((left, right) => right.priority - left.priority)
    );
    return accumulator;
  },
  new Map<string, DeploymentSpec[]>()
);
const deploymentsById = new Map(DEPLOYMENTS.map((deployment) => [deployment.id, deployment]));

export const getRuntimeProviders = () => PROVIDERS.map((provider) => ({ ...provider }));

export const getRuntimeProviderById = (providerId: RuntimeProviderId) =>
  providersById.get(providerId) ?? null;

export const getDeployments = () => DEPLOYMENTS.map((deployment) => ({ ...deployment }));

export const getDeploymentById = (deploymentId: string) => deploymentsById.get(deploymentId) ?? null;

export const getDeploymentsForLogicalModel = (
  logicalModel: DeploymentSpec["logicalModel"],
  capability: DeploymentSpec["capability"]
) =>
  (deploymentsByLogicalCapability.get(`${logicalModel}:${capability}`) ?? []).map((deployment) => ({
    ...deployment,
  }));

export const getRuntimeProviderCredentials = (
  providerId: RuntimeProviderId
): RuntimeProviderCredentials => {
  const config = getConfig();
  switch (providerId) {
    case "ark":
      return {
        apiKey: config.arkApiKey?.trim() ?? "",
      };
    case "dashscope":
      return {
        apiKey: config.dashscopeApiKey?.trim() ?? "",
      };
    case "kling":
      return {
        apiKey: config.klingApiKey?.trim() ?? "",
        accessKey: config.klingAccessKey?.trim() ?? "",
        secretKey: config.klingSecretKey?.trim() ?? "",
      };
  }
};

export const getRuntimeProviderKey = (providerId: RuntimeProviderId) =>
  getRuntimeProviderCredentials(providerId).apiKey ?? "";

export const getRuntimeProviderConfiguration = (providerId: RuntimeProviderId) => {
  const credentials = getRuntimeProviderCredentials(providerId);
  const configured =
    providerId === "kling"
      ? Boolean(credentials.apiKey || (credentials.accessKey && credentials.secretKey))
      : Boolean(credentials.apiKey);
  return {
    configured,
    missingCredential: !configured,
  };
};

export const resolveRouteTarget = (input: RouterSelectionInput): ResolvedRouteTarget | null => {
  const frontendModel = getFrontendImageModelById(input.modelId);
  if (!frontendModel || frontendModel.capability !== input.capability) {
    return null;
  }

  const deployment = (deploymentsByLogicalCapability.get(
    `${frontendModel.logicalModel}:${input.capability}`
  ) ?? []).find((entry) => entry.enabled);
  if (!deployment) {
    return null;
  }

  const provider = providersById.get(deployment.provider);
  if (!provider) {
    return null;
  }

  return {
    frontendModel,
    deployment,
    provider,
  };
};

export const getDefaultDeploymentForModel = (modelId: FrontendImageModelId | string) => {
  const frontendModel = getFrontendImageModelById(modelId);
  if (!frontendModel) {
    return null;
  }

  return (
    (deploymentsByLogicalCapability.get(
      `${frontendModel.logicalModel}:${frontendModel.capability}`
    ) ?? []).find((entry) => entry.enabled) ?? null
  );
};
