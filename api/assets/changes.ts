import type { ApiRequest, ApiResponse } from "../_utils";
import { sendError } from "../_utils";
import { requireUserId } from "./_auth";
import { listAssetChanges } from "./_store";

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== "GET") {
    sendError(response, 405, "Method not allowed");
    return;
  }

  const userId = requireUserId(request, response);
  if (!userId) {
    return;
  }

  const url = new URL(request.url || "http://localhost/api/assets/changes", "http://localhost");
  const since = url.searchParams.get("since") || undefined;
  const changes = (await listAssetChanges(userId, since)).map((record) => ({
    remoteAssetId: record.remoteAssetId,
    contentHash: record.contentHash,
    updatedAt: record.updatedAt,
    deletedAt: record.deletedAt,
  }));

  response.status(200).json({
    since,
    changes,
  });
}
