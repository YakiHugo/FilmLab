import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const encodeBase64Url = (value: string) =>
  Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const createHs256Token = (userId: string, secret: string) => {
  const header = encodeBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = encodeBase64Url(
    JSON.stringify({
      sub: userId,
      exp: Math.floor(Date.now() / 1000) + 60,
    })
  );
  const signature = createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return `${header}.${payload}.${signature}`;
};

const createUnsignedDevToken = (userId: string) => {
  const header = encodeBase64Url(JSON.stringify({ alg: "none", typ: "JWT" }));
  const payload = encodeBase64Url(
    JSON.stringify({
      sub: userId,
      exp: Math.floor(Date.now() / 1000) + 60,
    })
  );
  return `${header}.${payload}.dev`;
};

describe("parseJwtSub", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("accepts HS256 tokens signed with the configured secret", async () => {
    vi.stubEnv("AUTH_JWT_SECRET", "test-secret");

    const { parseJwtSub } = await import("./user");

    expect(parseJwtSub(createHs256Token("user-1", "test-secret"))).toBe("user-1");
  });

  it("rejects HS256 tokens with an invalid signature", async () => {
    vi.stubEnv("AUTH_JWT_SECRET", "test-secret");

    const { parseJwtSub } = await import("./user");

    expect(parseJwtSub(createHs256Token("user-1", "wrong-secret"))).toBeNull();
  });

  it("allows unsigned dev tokens only for allowlisted users", async () => {
    vi.stubEnv("ALLOW_UNSIGNED_DEV_AUTH", "true");
    vi.stubEnv("DEV_AUTH_ALLOWED_USER_IDS", "local-user,review-user");

    const { parseJwtSub } = await import("./user");

    expect(parseJwtSub(createUnsignedDevToken("review-user"))).toBe("review-user");
    expect(parseJwtSub(createUnsignedDevToken("user-1"))).toBeNull();
  });
});
