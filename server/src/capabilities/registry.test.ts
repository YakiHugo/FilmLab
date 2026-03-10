import { describe, expect, it } from "vitest";
import { createProviderCapabilitiesRegistry } from "./registry";
import { ProviderHealthStore } from "./healthStore";

describe("provider capabilities registry", () => {
  it("groups Qwen and Z Image under DashScope and exposes configured state", () => {
    const healthStore = new ProviderHealthStore();
    const registry = createProviderCapabilitiesRegistry({
      record: (input) => healthStore.record(input),
      getSnapshot: (provider, model, operation, now) =>
        healthStore.getSnapshot(provider, model, operation, now),
    });

    const snapshot = registry.getProviderCapabilities();
    const dashscope = snapshot.providers.find((provider) => provider.providerId === "dashscope");

    expect(dashscope).toBeDefined();
    expect(dashscope?.configured).toBeTypeOf("boolean");
    expect(dashscope?.families).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ familyId: "qwen" }),
        expect.objectContaining({ familyId: "zimage" }),
      ])
    );
    expect(dashscope?.models).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          familyId: "qwen",
          modelId: "qwen-image-2.0-pro",
        }),
        expect.objectContaining({
          familyId: "zimage",
          modelId: "z-image-turbo",
        }),
      ])
    );
  });

  it("decays health on canonical provider ids", () => {
    const healthStore = new ProviderHealthStore({
      windowMs: 60_000,
      circuitBreakerFailureThreshold: 3,
      circuitBreakerCooldownMs: 5_000,
      circuitBreakerRecoverySuccesses: 2,
    });
    const registry = createProviderCapabilitiesRegistry({
      record: (input) => healthStore.record(input),
      getSnapshot: (provider, model, operation, now) =>
        healthStore.getSnapshot(provider, model, operation, now),
    });

    registry.recordProviderCallResult({
      provider: "dashscope",
      model: "qwen-image-2.0-pro",
      operation: "generate",
      success: true,
      latencyMs: 400,
    });
    registry.recordProviderCallResult({
      provider: "dashscope",
      model: "qwen-image-2.0-pro",
      operation: "generate",
      success: false,
      latencyMs: 2500,
      errorType: "provider_error",
    });
    registry.recordProviderCallResult({
      provider: "dashscope",
      model: "qwen-image-2.0-pro",
      operation: "generate",
      success: false,
      latencyMs: 3200,
      errorType: "provider_error",
    });

    const snapshot = registry
      .getProviderCapabilities()
      .providers.find((item) => item.providerId === "dashscope")
      ?.models.find((item) => item.modelId === "qwen-image-2.0-pro")?.generation.health;

    expect(snapshot).toBeDefined();
    expect(snapshot?.sampleSize).toBe(3);
    expect(snapshot?.successRate).toBeLessThan(0.5);
    expect(snapshot?.score).toBeLessThan(60);
    expect(snapshot?.lastErrorType).toBe("provider_error");
  });

  it("marks unsupported operations as disabled in the operation matrix", () => {
    const registry = createProviderCapabilitiesRegistry();
    const snapshot = registry.getProviderCapabilities();
    const seedream = snapshot.providers.find((provider) => provider.providerId === "ark");
    const model = seedream?.models.find(
      (entry) => entry.modelId === "doubao-seedream-5-0-260128"
    );

    expect(model?.generation.enabled).toBe(true);
    expect(model?.upscale.enabled).toBe(false);
  });
});
