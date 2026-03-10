import { ProviderError } from "../../providers/base/errors";
import { resolveRouteTarget } from "./registry";
import type { ResolvedRouteTarget, RouterSelectionInput } from "./types";

export const selectRouteTarget = (input: RouterSelectionInput): ResolvedRouteTarget => {
  const target = resolveRouteTarget(input);
  if (!target) {
    throw new ProviderError(`Unsupported model/capability combination: ${input.modelId}.`, 400);
  }

  return target;
};

export const selectRouteTargets = (input: RouterSelectionInput) => [selectRouteTarget(input)];
