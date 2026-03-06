import { describe, expect, it } from "vitest";
import { createDevJwtToken, getUserIdFromJwt } from "./authToken";

describe("auth token helpers", () => {
  it("encodes and decodes dev jwt sub", () => {
    const token = createDevJwtToken("tester-1");
    expect(getUserIdFromJwt(token)).toBe("tester-1");
  });

  it("returns null for malformed token", () => {
    expect(getUserIdFromJwt("bad-token")).toBeNull();
  });
});

