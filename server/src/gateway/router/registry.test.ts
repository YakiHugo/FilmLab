import { describe, expect, it, vi } from "vitest";

const mockConfig = vi.hoisted(() => ({
  arkApiKey: "ark-server-key",
  dashscopeApiKey: "dashscope-server-key",
  klingAccessKey: "kling-access-key",
  klingSecretKey: "kling-secret-key",
}));

vi.mock("../../config", () => ({
  getConfig: () => mockConfig,
}));

describe("runtime route registry", () => {
  it("maps canonical providers to managed credentials", async () => {
    const {
      getRuntimeProviderConfiguration,
      getRuntimeProviderCredentials,
      getRuntimeProviderKey,
    } = await import("./registry");

    expect(getRuntimeProviderKey("ark")).toBe("ark-server-key");
    expect(getRuntimeProviderKey("dashscope")).toBe("dashscope-server-key");
    expect(getRuntimeProviderKey("kling")).toBe("");
    expect(getRuntimeProviderCredentials("kling")).toEqual({
      accessKey: "kling-access-key",
      secretKey: "kling-secret-key",
    });
    expect(getRuntimeProviderConfiguration("ark")).toEqual({
      configured: true,
      missingCredential: false,
    });
    expect(getRuntimeProviderConfiguration("kling")).toEqual({
      configured: true,
      missingCredential: false,
    });
  });

  it("resolves a frontend model to a default deployment and provider", async () => {
    const { getDefaultDeploymentForModel, resolveRouteTarget } = await import("./registry");

    expect(
      resolveRouteTarget({
        modelId: "qwen-image-2-pro",
        operation: "image.generate",
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
    expect(getDefaultDeploymentForModel("qwen-image-2-pro")?.id).toBe(
      "dashscope-qwen-image-2-pro-primary"
    );
  });
});
