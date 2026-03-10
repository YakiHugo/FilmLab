import { describe, expect, it, vi } from "vitest";

const mockConfig = vi.hoisted(() => ({
  arkApiKey: "ark-server-key",
  dashscopeApiKey: "dashscope-server-key",
  klingApiKey: "kling-server-key",
}));

vi.mock("../config", () => ({
  getConfig: () => mockConfig,
}));

describe("provider registry", () => {
  it("maps providers to the correct credential slots", async () => {
    const { resolveApiKey } = await import("./registry");

    expect(resolveApiKey("seedream")).toBe("ark-server-key");
    expect(resolveApiKey("qwen")).toBe("dashscope-server-key");
    expect(resolveApiKey("zimage")).toBe("dashscope-server-key");
    expect(resolveApiKey("kling")).toBe("kling-server-key");
    expect(resolveApiKey("qwen", " user-key ")).toBe("user-key");
  });

  it("reads provider-specific headers without changing the external request contract", async () => {
    const { getUserProviderKey } = await import("./registry");

    expect(
      getUserProviderKey(
        {
          "x-provider-key-qwen": "dashscope-user-key",
          "x-provider-key-zimage": "zimage-user-key",
          "x-provider-key-kling": ["kling-user-key"],
        },
        "qwen"
      )
    ).toBe("dashscope-user-key");

    expect(
      getUserProviderKey(
        {
          "x-provider-key-qwen": "dashscope-user-key",
          "x-provider-key-zimage": "zimage-user-key",
          "x-provider-key-kling": ["kling-user-key"],
        },
        "zimage"
      )
    ).toBe("zimage-user-key");

    expect(
      getUserProviderKey(
        {
          "x-provider-key-kling": ["kling-user-key"],
        },
        "kling"
      )
    ).toBe("kling-user-key");
  });
});
