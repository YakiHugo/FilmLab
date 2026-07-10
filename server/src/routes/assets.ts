import type { FastifyPluginAsync } from "fastify";
import { AssetUploadSessionError } from "../assets/service";

const normalizeMimeType = (value: string) => value.split(";", 1)[0]?.trim().toLowerCase() ?? "";

const sendUploadSessionError = (error: AssetUploadSessionError) => {
  switch (error.failure) {
    case "session_not_found":
      return { statusCode: 404, message: "Upload session not found." };
    case "mime_type_mismatch":
      return { statusCode: 415, message: "Upload MIME type does not match the session." };
    case "kind_not_enabled":
      return { statusCode: 409, message: "Upload kind is not enabled for this session." };
    case "original_not_uploaded":
      return { statusCode: 409, message: "Original image has not been uploaded." };
  }
};

export const assetRoute: FastifyPluginAsync = async (app) => {
  app.addContentTypeParser(/^image\//i, { parseAs: "buffer" }, (_request, body, done) => {
    done(null, body);
  });

  app.post("/api/assets/uploads/init", async (request, reply) => {
    const userId = request.userId!;

    const body = request.body as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const mimeType = typeof body.type === "string" ? normalizeMimeType(body.type) : "";
    const sizeBytes = Number(body.size);
    const createdAt =
      typeof body.createdAt === "string" ? body.createdAt : new Date().toISOString();
    const source = body.source === "ai-generated" ? "ai-generated" : "imported";
    const origin = body.origin === "url" || body.origin === "ai" ? body.origin : "file";
    const contentHash = typeof body.contentHash === "string" ? body.contentHash.trim() : "";
    const tags = Array.isArray(body.tags)
      ? body.tags.filter((entry): entry is string => typeof entry === "string")
      : [];
    const metadata =
      body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
        ? (body.metadata as Record<string, unknown>)
        : undefined;
    const includeThumbnail = Boolean(body.includeThumbnail);
    const assetId =
      typeof body.assetId === "string" && body.assetId.trim().length > 0
        ? body.assetId.trim()
        : undefined;

    if (!name || !mimeType.startsWith("image/") || !Number.isFinite(sizeBytes) || !contentHash) {
      return reply.code(400).send({ error: "Invalid upload init payload." });
    }

    return reply.send(
      await app.assetService.prepareUpload({
        assetId,
        userId,
        name,
        mimeType,
        sizeBytes,
        createdAt,
        source,
        origin,
        contentHash,
        tags,
        metadata,
        includeThumbnail,
      })
    );
  });

  app.put("/api/assets/upload/:assetId/:kind", async (request, reply) => {
    const userId = request.userId!;
    const params = request.params as { assetId?: string; kind?: string };
    const assetId = params.assetId?.trim();
    const kind =
      params.kind === "thumbnail" ? "thumbnail" : params.kind === "original" ? "original" : null;
    if (!assetId || !kind) {
      return reply.code(400).send({ error: "Invalid upload target." });
    }

    const contentType = request.headers["content-type"];
    const mimeType = typeof contentType === "string" ? normalizeMimeType(contentType) : "";
    if (!mimeType.startsWith("image/")) {
      return reply.code(400).send({ error: "Only image uploads are supported." });
    }

    const buffer = request.body;
    if (!Buffer.isBuffer(buffer) || buffer.byteLength === 0) {
      return reply.code(400).send({ error: "Empty upload body." });
    }

    try {
      await app.assetService.uploadSessionObject({
        userId,
        assetId,
        kind,
        buffer,
        mimeType,
      });
    } catch (error) {
      if (!(error instanceof AssetUploadSessionError)) {
        throw error;
      }
      const response = sendUploadSessionError(error);
      return reply.code(response.statusCode).send({ error: response.message });
    }
    return reply.code(204).send();
  });

  app.post("/api/assets/uploads/:assetId/complete", async (request, reply) => {
    const userId = request.userId!;
    const params = request.params as { assetId?: string };
    const assetId = params.assetId?.trim();
    if (!assetId) {
      return reply.code(400).send({ error: "Asset id is required." });
    }
    try {
      return reply.send(await app.assetService.completeUpload(userId, assetId));
    } catch (error) {
      if (!(error instanceof AssetUploadSessionError)) {
        throw error;
      }
      const response = sendUploadSessionError(error);
      return reply.code(response.statusCode).send({ error: response.message });
    }
  });

  app.get("/api/assets/changes", async (request, reply) => {
    const userId = request.userId!;

    const since =
      typeof request.query === "object" &&
      request.query !== null &&
      "since" in request.query &&
      typeof (request.query as Record<string, unknown>).since === "string"
        ? ((request.query as Record<string, unknown>).since as string).trim()
        : undefined;
    return reply.send({
      changes: await app.assetService.listChanges(userId, since),
    });
  });

  app.get("/api/assets/:assetId", async (request, reply) => {
    const userId = request.userId!;
    const params = request.params as { assetId?: string };
    const assetId = params.assetId?.trim();
    if (!assetId) {
      return reply.code(400).send({ error: "Asset id is required." });
    }
    const asset = await app.assetService.getAsset(userId, assetId);
    if (!asset) {
      return reply.code(404).send({ error: "Asset not found." });
    }
    return reply.send(asset);
  });

  app.get("/api/assets/:assetId/:kind", async (request, reply) => {
    const params = request.params as { assetId?: string; kind?: string };
    const assetId = params.assetId?.trim();
    const kind =
      params.kind === "thumbnail" ? "thumbnail" : params.kind === "original" ? "original" : null;
    const token =
      typeof request.query === "object" &&
      request.query !== null &&
      "token" in request.query &&
      typeof (request.query as Record<string, unknown>).token === "string"
        ? ((request.query as Record<string, unknown>).token as string).trim()
        : undefined;

    if (!assetId || !kind) {
      return reply.code(400).send({ error: "Invalid asset path." });
    }

    const content = await app.assetService.resolveBrowserAssetFile({
      assetId,
      kind,
      token,
      authorization: request.headers.authorization,
    });
    if (!content) {
      return reply.code(404).send({ error: "Asset file not found." });
    }

    reply.header("Content-Type", content.mimeType);
    reply.header("Cache-Control", "private, max-age=60");
    reply.header("X-Content-Type-Options", "nosniff");
    return reply.send(content.buffer);
  });

  app.delete("/api/assets/:assetId", async (request, reply) => {
    const userId = request.userId!;
    const params = request.params as { assetId?: string };
    const assetId = params.assetId?.trim();
    if (!assetId) {
      return reply.code(400).send({ error: "Asset id is required." });
    }
    await app.assetService.deleteAsset(userId, assetId);
    return reply.code(204).send();
  });
};
