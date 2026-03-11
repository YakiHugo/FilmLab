import { describe, expect, it } from "vitest";
import { createImageModelCatalogRegistry } from "./registry";
import { ProviderHealthStore } from "./healthStore";

describe("image model catalog registry", () => {
  it("builds a catalog with provider state and frontend models", () => {
    const healthStore = new ProviderHealthStore();
    const registry = createImageModelCatalogRegistry({
      record: (input) => healthStore.record(input),
      getSnapshot: (provider, model, operation, now) =>
        healthStore.getSnapshot(provider, model, operation, now),
    });

    const snapshot = registry.getCatalog();

    expect(snapshot.providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "ark" }),
        expect.objectContaining({ id: "dashscope" }),
        expect.objectContaining({ id: "kling" }),
      ])
    );
    expect(snapshot.models).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "seedream-v5",
          logicalModel: "image.seedream.v5",
          modelFamily: "seedream",
          defaultProvider: "ark",
          supportsUpscale: false,
          providerModel: "doubao-seedream-5-0-260128",
        }),
        expect.objectContaining({
          id: "qwen-image-2-pro",
          logicalModel: "image.qwen.v2.pro",
          modelFamily: "qwen",
          defaultProvider: "dashscope",
          supportsUpscale: false,
          providerModel: "qwen-image-2.0-pro",
        }),
      ])
    );
  });

  it("maps health into catalog status", () => {
    const healthStore = new ProviderHealthStore();
    const registry = createImageModelCatalogRegistry({
      record: (input) => healthStore.record(input),
      getSnapshot: (provider, model, operation, now) =>
        healthStore.getSnapshot(provider, model, operation, now),
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

    const model = registry.getCatalog().models.find((entry) => entry.id === "qwen-image-2-pro");
    expect(model?.health.state).toBe("down");
    expect(model?.health.lastErrorType).toBe("provider_error");
  });
});
