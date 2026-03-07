import { z } from "zod";
import type { ApiRequest, ApiResponse } from "../_utils";
import { readJsonBody, sendError } from "../_utils";
import { requireUserId } from "./_auth";
import {
  finishUploadSession,
  getUploadSession,
  hasObjectBinary,
  upsertAssetRecord,
} from "./_store";

const requestSchema = z.object({
  remoteAssetId: z.string().min(1),
  localAssetId: z.string().min(1),
  objectKey: z.string().min(1),
  thumbnailKey: z.string().optional(),
  name: z.string().min(1),
  type: z.string().min(1),
  size: z.number().int().min(1),
  createdAt: z.string().min(1),
  source: z.enum(["imported", "ai-generated"]).default("imported"),
  origin: z.enum(["file", "url", "ai"]).default("file"),
  contentHash: z.string().min(1),
  tags: z.array(z.string()).default([]),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== "POST") {
    sendError(response, 405, "Method not allowed");
    return;
  }

  const userId = requireUserId(request, response);
  if (!userId) {
    return;
  }

  let payload: z.infer<typeof requestSchema>;
  try {
    payload = requestSchema.parse(await readJsonBody(request));
  } catch {
    sendError(response, 400, "Invalid request payload.");
    return;
  }

  const session = await getUploadSession(userId, payload.remoteAssetId);
  if (!session) {
    sendError(response, 404, "Upload session not found.");
    return;
  }

  if (payload.objectKey !== session.objectKey) {
    sendError(response, 400, "Upload session key mismatch.");
    return;
  }
  if ((payload.thumbnailKey ?? "") !== (session.thumbnailKey ?? "")) {
    sendError(response, 400, "Upload session thumbnail key mismatch.");
    return;
  }

  if (!(await hasObjectBinary(payload.objectKey))) {
    sendError(response, 400, "Original image has not been uploaded.");
    return;
  }

  const now = new Date().toISOString();
  await upsertAssetRecord({
    remoteAssetId: payload.remoteAssetId,
    userId,
    contentHash: payload.contentHash,
    source: payload.source,
    origin: payload.origin,
    objectKey: payload.objectKey,
    thumbnailKey: payload.thumbnailKey,
    metadata: payload.metadata,
    tags: payload.tags,
    name: payload.name,
    type: payload.type,
    size: payload.size,
    createdAt: payload.createdAt,
    updatedAt: now,
  });
  await finishUploadSession(payload.remoteAssetId);

  response.status(200).json({
    ok: true,
    remoteAssetId: payload.remoteAssetId,
    updatedAt: now,
  });
}
