import type { ApiRequest, ApiResponse } from "../_utils";
import { sendError } from "../_utils";
import { requireUserId } from "./_auth";
import { deleteAssetRecord, getAssetById } from "./_store";

const parseAssetId = (request: ApiRequest) => {
  const url = new URL(request.url || "http://localhost/api/assets", "http://localhost");
  const segments = url.pathname.split("/").filter(Boolean);
  return decodeURIComponent(segments[2] ?? "");
};

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== "DELETE") {
    sendError(response, 405, "Method not allowed");
    return;
  }

  const userId = requireUserId(request, response);
  if (!userId) {
    return;
  }

  const assetId = parseAssetId(request);
  if (!assetId) {
    sendError(response, 400, "Missing asset id.");
    return;
  }

  const existing = await getAssetById(userId, assetId);
  if (!existing || existing.deletedAt) {
    response.status(200).json({ ok: true, deleted: false });
    return;
  }

  const deleted = await deleteAssetRecord(userId, assetId);
  if (!deleted) {
    sendError(response, 404, "Asset not found.");
    return;
  }

  response.status(200).json({
    ok: true,
    deleted: true,
    remoteAssetId: deleted.remoteAssetId,
    deletedAt: deleted.deletedAt,
  });
}
