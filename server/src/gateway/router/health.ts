import { routerStateStore, type RouterStateStore } from "./state_store";
import type { HealthRecordInput, RuntimeProviderId } from "./types";

export const createRouterHealth = (stateStore: RouterStateStore) => ({
  record(input: HealthRecordInput) {
    stateStore.record(input);
  },
  getSnapshot(
    provider: RuntimeProviderId,
    model: string,
    operation: HealthRecordInput["operation"],
    now = Date.now()
  ) {
    return stateStore.getHealthSnapshot(provider, model, operation, now);
  },
});

export const routerHealth = createRouterHealth(routerStateStore);
