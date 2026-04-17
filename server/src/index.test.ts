import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const closeMock = vi.fn();

vi.mock("./chat/persistence/repository", () => ({
  createChatStateRepository: () => ({
    close: closeMock,
    getConversationById: vi.fn(),
    getOrCreateActiveConversation: vi.fn(),
    getConversationSnapshot: vi.fn(),
    getPromptArtifactsForTurn: vi.fn(),
    getPromptObservabilityForConversation: vi.fn(),
    clearActiveConversation: vi.fn(),
    deleteTurn: vi.fn(),
    createTurn: vi.fn(),
    createGeneration: vi.fn(),
    createRun: vi.fn(),
    createPromptVersions: vi.fn(),
    updateConversationPromptState: vi.fn(),
    acceptConversationTurn: vi.fn(),
    completeGenerationSuccess: vi.fn(),
    completeGenerationFailure: vi.fn(),
    turnExists: vi.fn(),
  }),
}));

const poolQueryMock = vi.fn();

vi.mock("pg", async () => {
  const actual = await vi.importActual<typeof import("pg")>("pg");
  class MockPool {
    query = (...args: unknown[]) => poolQueryMock(...args);
    end = vi.fn().mockResolvedValue(undefined);
    on = vi.fn();
  }
  return {
    ...actual,
    Pool: MockPool,
  };
});

vi.mock("node-pg-migrate", () => ({
  runner: vi.fn().mockResolvedValue(undefined),
}));

describe("buildServer", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "development");
    closeMock.mockReset();
    poolQueryMock.mockReset();
    const { resetConfigForTests } = await import("./config");
    resetConfigForTests();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    const { resetConfigForTests } = await import("./config");
    resetConfigForTests();
  });

  it("closes the repository through Fastify lifecycle hooks", async () => {
    const { buildServer } = await import("./index");

    const app = await buildServer();
    await app.close();

    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it("generates a server-side x-request-id by default", async () => {
    const { buildServer } = await import("./index");

    const app = await buildServer();

    const response = await app.inject({
      method: "GET",
      url: "/health",
      headers: {
        "x-request-id": "client-trace-1",
      },
    });

    expect(response.headers["x-request-id"]).toEqual(expect.stringMatching(/^req-/));
    expect(response.headers["x-request-id"]).not.toBe("client-trace-1");

    await app.close();
  });

  it("reuses x-request-id only when trusted proxy mode is enabled", async () => {
    vi.stubEnv("TRUST_PROXY_REQUEST_ID", "true");
    const { resetConfigForTests } = await import("./config");
    resetConfigForTests();

    const { buildServer } = await import("./index");
    const app = await buildServer();

    const echoed = await app.inject({
      method: "GET",
      url: "/health",
      headers: {
        "x-request-id": "proxy-trace-1",
      },
    });
    const invalid = await app.inject({
      method: "GET",
      url: "/health",
      headers: {
        "x-request-id": "bad trace id with spaces",
      },
    });

    expect(echoed.headers["x-request-id"]).toBe("proxy-trace-1");
    expect(invalid.headers["x-request-id"]).toEqual(expect.stringMatching(/^req-/));

    await app.close();
  });

  it("reports readiness as ok when no database is configured", async () => {
    const { buildServer } = await import("./index");
    const app = await buildServer();

    const response = await app.inject({ method: "GET", url: "/health/ready" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });

    await app.close();
  });

  it("probes the database when DATABASE_URL is set", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://example/db");
    const { resetConfigForTests } = await import("./config");
    resetConfigForTests();

    poolQueryMock.mockResolvedValueOnce({ rows: [{ "?column?": 1 }], rowCount: 1 });

    const { buildServer } = await import("./index");
    const app = await buildServer();

    const response = await app.inject({ method: "GET", url: "/health/ready" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
    expect(poolQueryMock).toHaveBeenCalledWith("SELECT 1");

    await app.close();
  });

  it("returns 503 when the database probe fails", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://example/db");
    const { resetConfigForTests } = await import("./config");
    resetConfigForTests();

    poolQueryMock.mockRejectedValueOnce(new Error("connection refused"));

    const { buildServer } = await import("./index");
    const app = await buildServer();

    const response = await app.inject({ method: "GET", url: "/health/ready" });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: "unavailable" });

    await app.close();
  });
});
