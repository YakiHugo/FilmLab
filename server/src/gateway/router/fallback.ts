import type { ProviderRouteTarget } from "./types";
import { resolveFallbackRouteTargets } from "./registry";

export const getFallbackTargets = (target: ProviderRouteTarget) =>
  resolveFallbackRouteTargets(target);
