import { describe, expect, it } from "vitest";
import { createProviderCapabilitiesRegistry } from "./registry";
import { ProviderHealthStore } from "./healthStore";

describe("provider capabilities registry", () => {
  it("decays health when failures accumulate inside the time window", () => {
    const healthStore = new ProviderHealthStore({
      windowMs: 60_000,
      circuitBreakerFailureThreshold: 3,
      circuitBreakerCooldownMs: 5_000,
      circuitBreakerRecoverySuccesses: 2,
    });
    const registry = createProviderCapabilitiesRegistry(healthStore);

    registry.recordProviderCallResult({
      provider: "qwen",
      model: "qwen-image-2.0-pro",
      operation: "generate",
      success: true,
      latencyMs: 400,
    });
    registry.recordProviderCallResult({
      provider: "qwen",
      model: "qwen-image-2.0-pro",
      operation: "generate",
      success: false,
      latencyMs: 2500,
      errorType: "provider_error",
    });
    registry.recordProviderCallResult({
      provider: "qwen",
      model: "qwen-image-2.0-pro",
      operation: "generate",
      success: false,
      latencyMs: 3200,
      errorType: "provider_error",
    });

    const snapshot = registry
      .getProviderCapabilities()
      .providers.find((item) => item.providerId === "qwen")
      ?.models.find((item) => item.modelId === "qwen-image-2.0-pro")?.generation.health;

    expect(snapshot).toBeDefined();
    expect(snapshot?.sampleSize).toBe(3);
    expect(snapshot?.successRate).toBeLessThan(0.5);
    expect(snapshot?.score).toBeLessThan(60);
    expect(snapshot?.lastErrorType).toBe("provider_error");
  });

  it("recovers health after old failures leave the window", () => {
    const now = 1_000_000;
    const healthStore = new ProviderHealthStore({
      windowMs: 10_000,
      circuitBreakerFailureThreshold: 5,
      circuitBreakerCooldownMs: 1_000,
      circuitBreakerRecoverySuccesses: 2,
    });
    const registry = createProviderCapabilitiesRegistry(healthStore);

    registry.recordProviderCallResult({
      provider: "zimage",
      model: "z-image-turbo",
      operation: "generate",
      success: false,
      latencyMs: 1800,
      errorType: "timeout",
      occurredAt: now,
    });

    const degraded = registry
      .getProviderCapabilities(now)
      .providers.find((item) => item.providerId === "zimage")
      ?.models.find((item) => item.modelId === "z-image-turbo")?.generation.health;

    expect(degraded?.score).toBeLessThan(50);

    registry.recordProviderCallResult({
      provider: "zimage",
      model: "z-image-turbo",
      operation: "generate",
      success: true,
      latencyMs: 400,
      occurredAt: now + 11_000,
    });

    const recovered = registry
      .getProviderCapabilities(now + 11_000)
      .providers.find((item) => item.providerId === "zimage")
      ?.models.find((item) => item.modelId === "z-image-turbo")?.generation.health;

    expect(recovered?.sampleSize).toBe(1);
    expect(recovered?.successRate).toBe(1);
    expect(recovered?.score).toBeGreaterThanOrEqual(90);
  });

  it("opens and closes circuit breaker after cooldown and recovery successes", () => {
    const base = 5_000_000;
    const healthStore = new ProviderHealthStore({
      windowMs: 120_000,
      circuitBreakerFailureThreshold: 3,
      circuitBreakerCooldownMs: 5_000,
      circuitBreakerRecoverySuccesses: 2,
    });
    const registry = createProviderCapabilitiesRegistry(healthStore);

    for (let i = 0; i < 3; i += 1) {
      registry.recordProviderCallResult({
        provider: "seedream",
        model: "doubao-seedream-5-0-260128",
        operation: "generate",
        success: false,
        latencyMs: 1500,
        errorType: "provider_error",
        occurredAt: base + i,
      });
    }

    const opened = registry
      .getProviderCapabilities(base + 100)
      .providers.find((item) => item.providerId === "seedream")
      ?.models.find((item) => item.modelId === "doubao-seedream-5-0-260128")?.generation.health;

    expect(opened?.circuitOpen).toBe(true);
    expect(opened?.score).toBeLessThanOrEqual(25);

    registry.recordProviderCallResult({
      provider: "seedream",
      model: "doubao-seedream-5-0-260128",
      operation: "generate",
      success: true,
      latencyMs: 600,
      occurredAt: base + 6_000,
    });

    const halfRecovered = registry
      .getProviderCapabilities(base + 6_001)
      .providers.find((item) => item.providerId === "seedream")
      ?.models.find((item) => item.modelId === "doubao-seedream-5-0-260128")?.generation.health;
    expect(halfRecovered?.circuitOpen).toBe(true);

    registry.recordProviderCallResult({
      provider: "seedream",
      model: "doubao-seedream-5-0-260128",
      operation: "generate",
      success: true,
      latencyMs: 500,
      occurredAt: base + 7_000,
    });

    const closed = registry
      .getProviderCapabilities(base + 7_001)
      .providers.find((item) => item.providerId === "seedream")
      ?.models.find((item) => item.modelId === "doubao-seedream-5-0-260128")?.generation.health;

    expect(closed?.circuitOpen).toBe(false);
    expect(closed?.score).toBeGreaterThan(25);
  });
});
