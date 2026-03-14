import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("server config startup validation", () => {
  beforeEach(async () => {
    vi.resetModules();
    const { resetConfigForTests } = await import("./config");
    resetConfigForTests();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    const { resetConfigForTests } = await import("./config");
    resetConfigForTests();
  });

  it("requires DATABASE_URL and AUTH_JWT_SECRET outside development and test", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("AUTH_JWT_SECRET", "");

    const { assertStartupConfig, getConfig, resetConfigForTests } = await import("./config");
    resetConfigForTests();

    expect(() => assertStartupConfig(getConfig())).toThrow(
      "DATABASE_URL is required outside development and test."
    );
  });

  it("rejects unsigned dev auth outside development", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("ALLOW_UNSIGNED_DEV_AUTH", "true");

    const { assertStartupConfig, getConfig, resetConfigForTests } = await import("./config");
    resetConfigForTests();

    expect(() => assertStartupConfig(getConfig())).toThrow(
      "ALLOW_UNSIGNED_DEV_AUTH is only supported when NODE_ENV=development."
    );
  });

  it("enables unsigned dev auth by default in development", async () => {
    vi.stubEnv("NODE_ENV", "development");

    const { getConfig, resetConfigForTests } = await import("./config");
    resetConfigForTests();

    expect(getConfig().allowUnsignedDevAuth).toBe(true);
  });
});
