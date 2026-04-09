import { providerHealthStore, type ProviderCallResultInput } from "../../capabilities/healthStore";
import type { RuntimeProviderId } from "./types";

export const routerHealth = {
  record(input: ProviderCallResultInput) {
    providerHealthStore.record(input);
  },
  getSnapshot(
    provider: RuntimeProviderId,
    model: string,
    operation: ProviderCallResultInput["operation"],
    now = Date.now()
  ) {
    return providerHealthStore.getSnapshot(provider, model, operation, now);
  },
};
