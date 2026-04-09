import { ProviderError } from "../../providers/base/errors";
import { getDeploymentsForLogicalModel, getRuntimeProviderById, getRuntimeProviderConfiguration, resolveRouteTarget } from "./registry";
import { routerHealth } from "./health";
import type { ImageOperation, ResolvedRouteTarget, RouterSelectionInput } from "./types";

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

  if (requestedTarget && filteredDeployments.length === 0) {
    throw new ProviderError(
      `No deployment matches requestedTarget for model ${input.modelId}.`,
      400
    );
  }

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

  if (!requestedTarget) {
    const configuredCandidates = dedupedCandidates.filter(
      (candidate) => getRuntimeProviderConfiguration(candidate.provider.id).configured
    );
    if (configuredCandidates.length > 0) {
      dedupedCandidates.length = 0;
      dedupedCandidates.push(...configuredCandidates);
    }
  }

  const now = Date.now();
  const operation = input.operation as ImageOperation;

  const healthScores = new Map(
    dedupedCandidates.map((candidate) => [
      candidate.deployment.id,
      routerHealth.getSnapshot(
        candidate.provider.id,
        candidate.deployment.providerModel,
        operation,
        now
      ).score,
    ])
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

    const priorityDiff = right.deployment.priority - left.deployment.priority;
    if (priorityDiff !== 0) {
      return priorityDiff;
    }

    return (healthScores.get(right.deployment.id) ?? 100) - (healthScores.get(left.deployment.id) ?? 100);
  });

  return dedupedCandidates;
};
