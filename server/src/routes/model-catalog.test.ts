import { describe, expect, it, vi } from "vitest";
import type { AppConfig } from "../config";

const getCatalogMock = vi.fn();

vi.mock("../capabilities/registry", () => ({
  createImageModelCatalogRegistry: () => ({
    getCatalog: (...args: unknown[]) => getCatalogMock(...args),
  }),
}));

const testConfig = {} as AppConfig;

describe("createModelCatalogRoute", () => {
  it("returns the image.generate model catalog", async () => {
    const { default: Fastify } = await import("fastify");
    const { createModelCatalogRoute } = await import("./model-catalog");

    getCatalogMock.mockReturnValueOnce({
      generatedAt: "2026-03-11T00:00:00.000Z",
      providers: [{ id: "ark", name: "Ark", configured: true, missingCredential: false }],
      models: [{ id: "seedream-v5", label: "Seedream 5.0" }],
    });

    const app = Fastify();
    await app.register(createModelCatalogRoute(testConfig));

    const response = await app.inject({
      method: "GET",
      url: "/api/models/catalog?capability=image.generate",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      generatedAt: "2026-03-11T00:00:00.000Z",
      providers: [{ id: "ark", name: "Ark", configured: true, missingCredential: false }],
      models: [{ id: "seedream-v5", label: "Seedream 5.0" }],
    });

    await app.close();
  });

  it("rejects unsupported capabilities", async () => {
    const { default: Fastify } = await import("fastify");
    const { createModelCatalogRoute } = await import("./model-catalog");

    const app = Fastify();
    await app.register(createModelCatalogRoute(testConfig));

    const response = await app.inject({
      method: "GET",
      url: "/api/models/catalog?capability=image.upscale",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "Unsupported capability: image.upscale.",
    });

    await app.close();
  });
});
