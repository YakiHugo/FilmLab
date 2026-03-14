import { afterEach, describe, expect, it, vi } from "vitest";

describe("registerCors", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not expose deprecated provider key headers in CORS preflight responses", async () => {
    const { default: Fastify } = await import("fastify");
    const { registerCors } = await import("./cors");

    const app = Fastify();
    await app.register(registerCors);
    app.post("/probe", async () => ({ ok: true }));

    const response = await app.inject({
      method: "OPTIONS",
      url: "/probe",
      headers: {
        origin: "http://localhost:5173",
        "access-control-request-method": "POST",
        "access-control-request-headers": "x-provider-key-seedream,content-type",
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-headers"]).not.toContain(
      "X-Provider-Key-seedream"
    );

    await app.close();
  });

  it("allows DELETE preflight requests for conversation mutation routes", async () => {
    const { default: Fastify } = await import("fastify");
    const { registerCors } = await import("./cors");

    const app = Fastify();
    await app.register(registerCors);
    app.delete("/probe", async () => ({ ok: true }));

    const response = await app.inject({
      method: "OPTIONS",
      url: "/probe",
      headers: {
        origin: "http://localhost:5173",
        "access-control-request-method": "DELETE",
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-methods"]).toContain("DELETE");

    await app.close();
  });
});
