import { describe, expect, it } from "vitest";
import { ProviderError } from "../base/errors";
import { generateKlingAuthToken, resolveKlingBearerToken } from "./auth";

const decodeJwtSegment = (segment: string) =>
  JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as Record<string, unknown>;

describe("kling auth", () => {
  it("generates an HS256 JWT from access and secret keys", () => {
    const token = generateKlingAuthToken("test-access-key", "test-secret-key", 1_700_000_000_000);
    const [header, payload, signature] = token.split(".");

    expect(decodeJwtSegment(header)).toEqual({
      alg: "HS256",
      typ: "JWT",
    });
    expect(decodeJwtSegment(payload)).toEqual({
      iss: "test-access-key",
      exp: 1_700_001_800,
      nbf: 1_699_999_995,
    });
    expect(signature).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("prefers a legacy bearer token override when present", () => {
    expect(
      resolveKlingBearerToken({
        apiKey: "legacy-bearer-token",
        accessKey: "ignored-access-key",
        secretKey: "ignored-secret-key",
      })
    ).toBe("legacy-bearer-token");
  });

  it("rejects missing access key and secret key when no legacy token is present", () => {
    expect(() => resolveKlingBearerToken({ accessKey: "only-access-key" })).toThrowError(
      new ProviderError("Kling access key and secret key are required.", 401)
    );
  });
});
