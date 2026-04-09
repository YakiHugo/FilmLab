import { describe, expect, it } from "vitest";
import type { AppConfig } from "../../config";
import {
  getRuntimeProviderConfiguration,
  getRuntimeProviderCredentials,
  getRuntimeProviderKey,
} from "./registry";

const mockConfig = {
  arkApiKey: "ark-server-key",
  arkApiBaseUrl: "https://ark.cn-beijing.volces.com",
  dashscopeApiKey: "dashscope-server-key",
  dashscopeApiBaseUrl: "https://dashscope.aliyuncs.com",
  klingAccessKey: "kling-access-key",
  klingSecretKey: "kling-secret-key",
  klingApiBaseUrl: "https://api-beijing.klingai.com",
} as AppConfig;

describe("runtime route registry", () => {
  it("maps canonical providers to managed credentials", () => {
    expect(getRuntimeProviderKey("ark", mockConfig)).toBe("ark-server-key");
    expect(getRuntimeProviderKey("dashscope", mockConfig)).toBe("dashscope-server-key");
    expect(getRuntimeProviderKey("kling", mockConfig)).toBe("");
    expect(getRuntimeProviderCredentials("kling", mockConfig)).toEqual({
      accessKey: "kling-access-key",
      secretKey: "kling-secret-key",
      baseUrl: "https://api-beijing.klingai.com",
    });
    expect(getRuntimeProviderConfiguration("ark", mockConfig)).toEqual({
      configured: true,
      missingCredential: false,
    });
    expect(getRuntimeProviderConfiguration("kling", mockConfig)).toEqual({
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
