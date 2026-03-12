import { ProviderError } from "../../providers/base/errors";
import { getDeploymentsForLogicalModel, getRuntimeProviderById, resolveRouteTarget } from "./registry";
import type { ResolvedRouteTarget, RouterSelectionInput } from "./types";

export const selectRouteTarget = (input: RouterSelectionInput): ResolvedRouteTarget => {
  const target = resolveRouteTarget(input);
  if (!target) {
    throw new ProviderError(`Unsupported model/capability combination: ${input.modelId}.`, 400);
  }

  return target;
};

export const selectRouteTargets = (input: RouterSelectionInput) => {
  const primaryTarget = selectRouteTarget(input);
  const deployments = getDeploymentsForLogicalModel(
    primaryTarget.frontendModel.logicalModel,
    primaryTarget.frontendModel.capability
  ).filter((deployment) => deployment.enabled);

  const requestedTarget = input.requestedTarget;
  const filteredDeployments = deployments.filter((deployment) => {
    if (requestedTarget?.deploymentId && deployment.id !== requestedTarget.deploymentId) {
      return false;
    }
    if (requestedTarget?.provider && deployment.provider !== requestedTarget.provider) {
      return false;
    }
    return true;
  });

  const candidates = (filteredDeployments.length > 0 ? filteredDeployments : deployments).map(
    (deployment) => {
      const provider = getRuntimeProviderById(deployment.provider);
      if (!provider) {
        throw new ProviderError(`Unknown provider ${deployment.provider}.`, 500);
      }

      return {
        frontendModel: primaryTarget.frontendModel,
        deployment,
        provider,
      } satisfies ResolvedRouteTarget;
    }
  );

  const dedupedCandidates = candidates.filter(
    (candidate, index) =>
      candidates.findIndex((entry) => entry.deployment.id === candidate.deployment.id) === index
  );

  dedupedCandidates.sort((left, right) => {
    if (requestedTarget?.deploymentId) {
      const leftPinned = left.deployment.id === requestedTarget.deploymentId ? 1 : 0;
      const rightPinned = right.deployment.id === requestedTarget.deploymentId ? 1 : 0;
      if (leftPinned !== rightPinned) {
        return rightPinned - leftPinned;
      }
    }

    if (requestedTarget?.provider) {
      const leftPinned = left.deployment.provider === requestedTarget.provider ? 1 : 0;
      const rightPinned = right.deployment.provider === requestedTarget.provider ? 1 : 0;
      if (leftPinned !== rightPinned) {
        return rightPinned - leftPinned;
      }
    }

    return right.deployment.priority - left.deployment.priority;
  });

  return dedupedCandidates;
};
