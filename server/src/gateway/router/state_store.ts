import {
  providerHealthStore,
  type ProviderCallResultInput,
  type ProviderHealthSnapshot,
} from "../../capabilities/healthStore";
import type { RuntimeProviderId } from "./types";

export class RouterStateStore {
  record(result: ProviderCallResultInput) {
    providerHealthStore.record(result);
  }

  getHealthSnapshot(
    provider: RuntimeProviderId,
    model: string,
    operation: ProviderCallResultInput["operation"],
    now = Date.now()
  ): ProviderHealthSnapshot {
    return providerHealthStore.getSnapshot(provider, model, operation, now);
  }
}

export const routerStateStore = new RouterStateStore();
