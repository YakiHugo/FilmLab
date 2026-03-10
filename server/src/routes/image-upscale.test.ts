import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getProviderAdapterMock = vi.fn();
const getUserProviderKeyMock = vi.fn();
const resolveApiKeyMock = vi.fn();

vi.mock("../providers/registry", () => ({
  getProviderAdapter: (...args: unknown[]) => getProviderAdapterMock(...args),
  getUserProviderKey: (...args: unknown[]) => getUserProviderKeyMock(...args),
  resolveApiKey: (...args: unknown[]) => resolveApiKeyMock(...args),
}));

describe("imageUpscaleRoute", () => {
  beforeEach(() => {
    vi.resetModules();
    getProviderAdapterMock.mockReset();
    getProviderAdapterMock.mockReturnValue({});
    getUserProviderKeyMock.mockReset();
    getUserProviderKeyMock.mockReturnValue("user-key");
    resolveApiKeyMock.mockReset();
    resolveApiKeyMock.mockReturnValue("user-key");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects upscale requests for active providers without an upscale adapter", async () => {
    const { default: Fastify } = await import("fastify");
    const { imageUpscaleRoute } = await import("./image-upscale");

    const app = Fastify();
    await app.register(imageUpscaleRoute);

    const response = await app.inject({
      method: "POST",
      url: "/api/image-upscale",
      payload: {
        provider: "seedream",
        model: "doubao-seedream-5-0-260128",
        imageId: "cached-1",
        scale: "2x",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "Upscale is not supported for provider: seedream",
    });

    await app.close();
  });
});
