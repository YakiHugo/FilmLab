import { describe, expect, it } from "vitest";
import { getDeployments } from "../../gateway/router/registry";
import { getPlatformModelAdapter, getPlatformModelAdapters } from "./registry";

describe("platform model adapter registry", () => {
  it("registers a model adapter for every enabled deployment", () => {
    const enabledDeployments = getDeployments().filter((deployment) => deployment.enabled);

    expect(enabledDeployments).not.toHaveLength(0);

    for (const deployment of enabledDeployments) {
      const adapter = getPlatformModelAdapter(deployment.provider, deployment.providerModel);
      expect(adapter).toMatchObject({
        provider: deployment.provider,
        providerModel: deployment.providerModel,
      });
    }
  });

  it("exposes unique adapter keys with explicit transport metadata", () => {
    const adapters = getPlatformModelAdapters();
    const keys = adapters.map((adapter) => `${adapter.provider}:${adapter.providerModel}`);

    expect(new Set(keys).size).toBe(adapters.length);
    expect(adapters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: "ark",
          providerModel: "doubao-seedream-5-0-260128",
          transport: "http",
        }),
        expect.objectContaining({
          provider: "dashscope",
          providerModel: "qwen-image-2.0-pro",
          transport: "http",
        }),
      ])
    );
  });
});
