import { describe, expect, it, vi } from "vitest";

const mockConfig = vi.hoisted(() => ({
  arkApiKey: "ark-server-key",
  dashscopeApiKey: "dashscope-server-key",
  klingApiKey: "kling-server-key",
}));

vi.mock("../../config", () => ({
  getConfig: () => mockConfig,
}));

describe("runtime route registry", () => {
  it("maps canonical providers to managed credentials", async () => {
    const { getRuntimeProviderConfiguration, getRuntimeProviderKey } = await import("./registry");

    expect(getRuntimeProviderKey("ark")).toBe("ark-server-key");
    expect(getRuntimeProviderKey("dashscope")).toBe("dashscope-server-key");
    expect(getRuntimeProviderKey("kling")).toBe("kling-server-key");
    expect(getRuntimeProviderConfiguration("ark")).toEqual({
      configured: true,
      missingCredential: false,
    });
  });

  it("resolves a frontend model to a primary deployment and provider", async () => {
    const { resolveRouteTarget } = await import("./registry");

    expect(
      resolveRouteTarget({
        modelId: "qwen-image-2-pro",
        capability: "image.generate",
      })
    ).toMatchObject({
      frontendModel: { id: "qwen-image-2-pro", logicalModel: "image.qwen.v2.pro" },
      deployment: {
        id: "dashscope-qwen-image-2-pro-primary",
        provider: "dashscope",
        providerModel: "qwen-image-2.0-pro",
      },
      provider: { id: "dashscope" },
    });
  });
});
