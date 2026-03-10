import { ProviderError } from "../../providers/base/errors";
import { getFallbackTargets } from "./fallback";
import { resolveRouteTarget } from "./registry";
import type { ProviderRouteTarget, RouterSelectionInput } from "./types";

export const selectRouteTarget = (input: RouterSelectionInput): ProviderRouteTarget => {
  const target = resolveRouteTarget(input);
  if (!target) {
    throw new ProviderError(
      `Unsupported model/provider combination: ${input.providerId} / ${input.model}.`,
      400
    );
  }

  if (!target.capability.enabled) {
    throw new ProviderError(
      `${target.family.displayName} ${target.model.displayName} does not support ${input.operation}.`,
      400
    );
  }

  return target;
};

export const selectRouteTargets = (input: RouterSelectionInput) => {
  const primaryTarget = selectRouteTarget(input);
  return [primaryTarget, ...getFallbackTargets(primaryTarget)];
};
