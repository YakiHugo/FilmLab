import { z } from "zod";
import type { ApiRequest, ApiResponse } from "../_utils";
import { readJsonBody, sendError } from "../_utils";
import { requireUserId } from "./_auth";
import {
  buildObjectKeys,
  createRemoteAssetId,
  createUploadSession,
  findAssetByHash,
} from "./_store";

const requestSchema = z.object({
  localAssetId: z.string().min(1),
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

  const existing = await findAssetByHash(userId, payload.contentHash);
  if (existing) {
    response.status(200).json({
      existing: true,
      remoteAssetId: existing.remoteAssetId,
      objectKey: existing.objectKey,
      thumbnailKey: existing.thumbnailKey,
      updatedAt: existing.updatedAt,
    });
    return;
  }

  const remoteAssetId = createRemoteAssetId();
  const { objectKey, thumbnailKey } = buildObjectKeys(userId, remoteAssetId);
  const session = await createUploadSession({
    remoteAssetId,
    userId,
    objectKey,
    thumbnailKey,
    createdAt: new Date().toISOString(),
  });

  response.status(200).json({
    existing: false,
    remoteAssetId,
    objectKey,
    thumbnailKey,
    upload: session.upload,
    thumbnailUpload: session.thumbnailUpload,
  });
}
