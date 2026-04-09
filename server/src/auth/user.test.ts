import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { AuthConfig } from "../config";
import { parseJwtSub } from "./user";

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

const baseConfig: AuthConfig = {
  nodeEnv: "test",
  allowUnsignedDevAuth: false,
  devAuthAllowedUserIds: ["local-user"],
};

describe("parseJwtSub", () => {
  it("accepts HS256 tokens signed with the configured secret", async () => {
    const config: AuthConfig = { ...baseConfig, authJwtSecret: "test-secret" };
    expect(await parseJwtSub(createHs256Token("user-1", "test-secret"), config)).toBe("user-1");
  });

  it("rejects HS256 tokens with an invalid signature", async () => {
    const config: AuthConfig = { ...baseConfig, authJwtSecret: "test-secret" };
    expect(await parseJwtSub(createHs256Token("user-1", "wrong-secret"), config)).toBeNull();
  });

  it("allows unsigned dev tokens only for allowlisted users", async () => {
    const config: AuthConfig = {
      ...baseConfig,
      nodeEnv: "development",
      allowUnsignedDevAuth: true,
      devAuthAllowedUserIds: ["local-user", "review-user"],
    };
    expect(await parseJwtSub(createUnsignedDevToken("review-user"), config)).toBe("review-user");
    expect(await parseJwtSub(createUnsignedDevToken("user-1"), config)).toBeNull();
  });

  it("allows unsigned dev tokens by default in development", async () => {
    const config: AuthConfig = {
      ...baseConfig,
      nodeEnv: "development",
      allowUnsignedDevAuth: true,
      devAuthAllowedUserIds: ["local-user"],
    };
    expect(await parseJwtSub(createUnsignedDevToken("local-user"), config)).toBe("local-user");
  });

  it("rejects unsigned dev tokens outside development", async () => {
    const config: AuthConfig = {
      ...baseConfig,
      nodeEnv: "test",
      allowUnsignedDevAuth: true,
      devAuthAllowedUserIds: ["local-user"],
    };
    expect(await parseJwtSub(createUnsignedDevToken("local-user"), config)).toBeNull();
  });
});
