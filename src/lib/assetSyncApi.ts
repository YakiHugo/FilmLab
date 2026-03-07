import { getClientAuthToken } from "./authToken";

export interface AssetPresignUploadRequest {
  localAssetId: string;
  name: string;
  type: string;
  size: number;
  createdAt: string;
  source: "imported" | "ai-generated";
  origin: "file" | "url" | "ai";
  contentHash: string;
  tags: string[];
  metadata?: Record<string, unknown>;
}

type UploadTarget = {
  method: "PUT";
  url: string;
  headers?: Record<string, string>;
};

export type AssetPresignUploadResponse =
  | {
      existing: true;
      remoteAssetId: string;
      objectKey: string;
      thumbnailKey?: string;
      updatedAt: string;
    }
  | {
      existing: false;
      remoteAssetId: string;
      objectKey: string;
      thumbnailKey?: string;
      upload: UploadTarget;
      thumbnailUpload?: UploadTarget;
    };

export interface AssetCompleteUploadRequest {
  remoteAssetId: string;
  localAssetId: string;
  objectKey: string;
  thumbnailKey?: string;
  name: string;
  type: string;
  size: number;
  createdAt: string;
  source: "imported" | "ai-generated";
  origin: "file" | "url" | "ai";
  contentHash: string;
  tags: string[];
  metadata?: Record<string, unknown>;
}

const parseJson = async (response: Response) => {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
};

const authHeaders = () => ({
  Authorization: `Bearer ${getClientAuthToken()}`,
});

const assertOk = async (response: Response, fallback: string) => {
  if (response.ok) {
    return;
  }
  const body = (await parseJson(response)) as { error?: unknown } | null;
  if (body && typeof body.error === "string" && body.error.trim()) {
    throw new Error(body.error);
  }
  throw new Error(fallback);
};

export const presignAssetUpload = async (
  payload: AssetPresignUploadRequest
): Promise<AssetPresignUploadResponse> => {
  const response = await fetch("/api/assets/presign-upload", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify(payload),
  });

  await assertOk(response, "Failed to prepare upload.");
  const json = (await parseJson(response)) as AssetPresignUploadResponse | null;
  if (!json || typeof json !== "object") {
    throw new Error("Invalid upload preparation response.");
  }
  return json;
};

export const completeAssetUpload = async (payload: AssetCompleteUploadRequest): Promise<void> => {
  const response = await fetch("/api/assets/complete-upload", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify(payload),
  });
  await assertOk(response, "Failed to complete upload.");
};

export const uploadToPresignedTarget = async (
  target: UploadTarget,
  blob: Blob
): Promise<void> => {
  const headers: Record<string, string> = { ...(target.headers ?? {}) };
  if (typeof window !== "undefined") {
    try {
      const maybeAbsolute = new URL(target.url, window.location.origin);
      if (maybeAbsolute.origin === window.location.origin) {
        headers.Authorization = `Bearer ${getClientAuthToken()}`;
      }
    } catch {
      // Ignore URL parsing and fall back to provided headers.
    }
  }

  const response = await fetch(target.url, {
    method: target.method,
    headers,
    body: blob,
  });
  await assertOk(response, "Failed to upload binary.");
};

export const deleteRemoteAsset = async (remoteAssetId: string): Promise<void> => {
  const response = await fetch(`/api/assets/${encodeURIComponent(remoteAssetId)}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  await assertOk(response, "Failed to delete remote asset.");
};

export interface AssetChangeRecord {
  remoteAssetId: string;
  contentHash: string;
  deletedAt?: string;
  updatedAt: string;
}

export const fetchAssetChanges = async (since?: string): Promise<AssetChangeRecord[]> => {
  const url = since
    ? `/api/assets/changes?since=${encodeURIComponent(since)}`
    : "/api/assets/changes";
  const response = await fetch(url, {
    method: "GET",
    headers: authHeaders(),
  });
  await assertOk(response, "Failed to load remote asset changes.");
  const json = (await parseJson(response)) as { changes?: unknown } | null;
  if (!json || !Array.isArray(json.changes)) {
    return [];
  }
  return json.changes.filter((item): item is AssetChangeRecord => {
    if (!item || typeof item !== "object") return false;
    const candidate = item as Partial<AssetChangeRecord>;
    return (
      typeof candidate.remoteAssetId === "string" &&
      typeof candidate.contentHash === "string" &&
      typeof candidate.updatedAt === "string"
    );
  });
};
