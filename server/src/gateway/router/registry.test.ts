import { describe, expect, it, vi } from "vitest";

const mockConfig = vi.hoisted(() => ({
  arkApiKey: "ark-server-key",
  dashscopeApiKey: "dashscope-server-key",
  klingApiKey: "kling-server-key",
}));

vi.mock("../../config", () => ({
  getConfig: () => mockConfig,
}));

describe("runtime registry", () => {
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

  it("normalizes canonical provider input back to legacy aliases for request validation", async () => {
    const { normalizeProviderForLegacySchema } = await import("./registry");

    expect(normalizeProviderForLegacySchema("ark", "doubao-seedream-5-0-260128")).toBe(
      "seedream"
    );
    expect(normalizeProviderForLegacySchema("dashscope", "qwen-image-2.0-pro")).toBe("qwen");
    expect(normalizeProviderForLegacySchema("dashscope", "z-image-turbo")).toBe("zimage");
  });

  it("resolves canonical provider and model family from legacy or canonical input", async () => {
    const { resolveRouteTarget } = await import("./registry");

    expect(
      resolveRouteTarget({
        providerId: "dashscope",
        model: "qwen-image-2.0-pro",
        operation: "generate",
      })
    ).toMatchObject({
      provider: { id: "dashscope" },
      family: { id: "qwen" },
      model: { id: "qwen-image-2.0-pro" },
    });

    expect(
      resolveRouteTarget({
        providerId: "zimage",
        model: "z-image-turbo",
        operation: "generate",
      })
    ).toMatchObject({
      provider: { id: "dashscope" },
      family: { id: "zimage" },
      model: { id: "z-image-turbo" },
    });
  });
});
