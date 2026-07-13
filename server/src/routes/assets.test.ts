import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

const encodeBase64Url = (value: string) => Buffer.from(value, "utf8").toString("base64url");

const createDevBearerToken = (userId: string) => {
  const header = encodeBase64Url(JSON.stringify({ alg: "none", typ: "JWT" }));
  const payload = encodeBase64Url(JSON.stringify({ sub: userId }));
  return `Bearer ${header}.${payload}.dev`;
};

describe("asset routes", () => {
  let app: FastifyInstance | null = null;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ALLOW_UNSIGNED_DEV_AUTH", "true");
    const { resetConfigForTests } = await import("../config");
    resetConfigForTests();
  });

  afterEach(async () => {
    await app?.close();
    app = null;
    vi.unstubAllEnvs();
    const { resetConfigForTests } = await import("../config");
    resetConfigForTests();
  });

  it("uploads, completes, and reads back an authenticated image", async () => {
    const { buildServer } = await import("../index");
    app = await buildServer();
    const authorization = createDevBearerToken("local-user");
    const contentHash = createHash("sha256").update(png).digest("hex");

    const preparedResponse = await app.inject({
      method: "POST",
      url: "/api/assets/uploads/init",
      headers: { authorization },
      payload: {
        assetId: "asset-upload-route-test",
        name: "pixel.png",
        type: "image/png; charset=binary",
        size: png.byteLength,
        contentHash,
        createdAt: "2026-07-10T00:00:00.000Z",
        source: "imported",
        origin: "file",
        includeThumbnail: false,
      },
    });

    expect(preparedResponse.statusCode).toBe(200);
    const prepared = preparedResponse.json<{
      assetId: string;
      upload: { method: "PUT"; url: string };
    }>();

    const uploadResponse = await app.inject({
      method: prepared.upload.method,
      url: prepared.upload.url,
      headers: {
        authorization,
        "content-type": "image/png; charset=binary",
      },
      payload: png,
    });
    expect(uploadResponse.statusCode).toBe(204);

    const completedResponse = await app.inject({
      method: "POST",
      url: `/api/assets/uploads/${encodeURIComponent(prepared.assetId)}/complete`,
      headers: { authorization },
    });
    expect(completedResponse.statusCode).toBe(200);
    const completed = completedResponse.json<{
      assetId: string;
      objectUrl: string;
    }>();
    expect(completed.assetId).toBe(prepared.assetId);

    const readResponse = await app.inject({
      method: "GET",
      url: completed.objectUrl,
    });
    expect(readResponse.statusCode).toBe(200);
    expect(readResponse.headers["content-type"]).toBe("image/png");
    expect(readResponse.rawPayload).toEqual(png);
  });

  it("returns stable client errors for invalid upload session operations", async () => {
    const { buildServer } = await import("../index");
    app = await buildServer();
    const authorization = createDevBearerToken("local-user");

    const missingSession = await app.inject({
      method: "PUT",
      url: "/api/assets/upload/missing/original",
      headers: {
        authorization,
        "content-type": "image/png",
      },
      payload: png,
    });
    expect(missingSession.statusCode).toBe(404);
    expect(missingSession.json()).toEqual({ error: "Upload session not found." });

    const preparedResponse = await app.inject({
      method: "POST",
      url: "/api/assets/uploads/init",
      headers: { authorization },
      payload: {
        assetId: "asset-invalid-operations",
        name: "pixel.png",
        type: "image/png",
        size: png.byteLength,
        contentHash: createHash("sha256").update(png).digest("hex"),
        createdAt: "2026-07-10T00:00:00.000Z",
        source: "imported",
        origin: "file",
        includeThumbnail: false,
      },
    });
    expect(preparedResponse.statusCode).toBe(200);

    const disabledKind = await app.inject({
      method: "PUT",
      url: "/api/assets/upload/asset-invalid-operations/thumbnail",
      headers: {
        authorization,
        "content-type": "image/png",
      },
      payload: png,
    });
    expect(disabledKind.statusCode).toBe(409);

    const mismatchedMimeType = await app.inject({
      method: "PUT",
      url: "/api/assets/upload/asset-invalid-operations/original",
      headers: {
        authorization,
        "content-type": "image/jpeg",
      },
      payload: png,
    });
    expect(mismatchedMimeType.statusCode).toBe(415);

    const incompleteUpload = await app.inject({
      method: "POST",
      url: "/api/assets/uploads/asset-invalid-operations/complete",
      headers: { authorization },
    });
    expect(incompleteUpload.statusCode).toBe(409);
  });

  it("enforces the configured body limit for image payloads", async () => {
    vi.stubEnv("REQUEST_BODY_LIMIT_MB", "1");
    const { resetConfigForTests } = await import("../config");
    resetConfigForTests();
    const { buildServer } = await import("../index");
    app = await buildServer();

    const response = await app.inject({
      method: "PUT",
      url: "/api/assets/upload/oversize/original",
      headers: {
        authorization: createDevBearerToken("local-user"),
        "content-type": "image/png",
      },
      payload: Buffer.alloc(1024 * 1024 + 1),
    });

    expect(response.statusCode).toBe(413);
  });
});
