import type { ApiRequest, ApiResponse } from "../../../_utils";
import { sendError } from "../../../_utils";
import { requireUserId } from "../../_auth";
import { getUploadSession, putObjectBinary } from "../../_store";

const readRawBody = async (request: ApiRequest): Promise<Buffer> => {
  if (Buffer.isBuffer(request.body)) {
    return request.body;
  }
  if (typeof request.body === "string") {
    return Buffer.from(request.body, "utf8");
  }
  if (request.body && request.body instanceof Uint8Array) {
    return Buffer.from(request.body);
  }
  if (typeof request.on !== "function") {
    return Buffer.alloc(0);
  }
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    request.on("data", (chunk: Buffer | string) => chunks.push(Buffer.from(chunk)));
    request.on("end", () => resolve());
    request.on("error", (error: unknown) =>
      reject(error instanceof Error ? error : new Error("Body stream failed."))
    );
  });
  return Buffer.concat(chunks);
};

const parseRouteParts = (request: ApiRequest) => {
  const url = new URL(request.url || "http://localhost/api/assets/upload", "http://localhost");
  const segments = url.pathname.split("/").filter(Boolean);
  const remoteAssetId = decodeURIComponent(segments[3] ?? "");
  const kind = segments[4] ?? "";
  return { remoteAssetId, kind };
};

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== "PUT") {
    sendError(response, 405, "Method not allowed");
    return;
  }

  const userId = requireUserId(request, response);
  if (!userId) {
    return;
  }

  const { remoteAssetId, kind } = parseRouteParts(request);
  if (!remoteAssetId || (kind !== "original" && kind !== "thumbnail")) {
    sendError(response, 400, "Invalid upload path.");
    return;
  }

  const session = await getUploadSession(userId, remoteAssetId);
  if (!session) {
    sendError(response, 404, "Upload session not found.");
    return;
  }

  const body = await readRawBody(request);
  if (body.length === 0) {
    sendError(response, 400, "Upload body is empty.");
    return;
  }

  const objectKey = kind === "original" ? session.objectKey : session.thumbnailKey;
  if (!objectKey) {
    sendError(response, 400, "Missing target object key.");
    return;
  }
  await putObjectBinary(objectKey, body);
  response.status(204).json({});
}
