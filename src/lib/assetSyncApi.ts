import { getClientAuthToken } from "./authToken";

export interface AssetUploadInitRequest {
  assetId?: string;
  name: string;
  type: string;
  size: number;
  createdAt: string;
  source: "imported" | "ai-generated";
  origin: "file" | "url" | "ai";
  contentHash: string;
  tags: string[];
  metadata?: Record<string, unknown>;
  includeThumbnail?: boolean;
}

type UploadTarget = {
  method: "PUT";
  url: string;
  headers?: Record<string, string>;
};

export interface AssetApiRecord {
  assetId: string;
  name: string;
  type: string;
  size: number;
  source: "imported" | "ai-generated";
  origin: "file" | "url" | "ai";
  contentHash: string;
  tags: string[];
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  objectUrl: string;
  thumbnailUrl: string;
}

export type AssetUploadInitResponse =
  | {
      existing: true;
      assetId: string;
      asset: AssetApiRecord;
    }
  | {
      existing: false;
      assetId: string;
      upload: UploadTarget;
      thumbnailUpload?: UploadTarget;
    };

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

export const prepareAssetUpload = async (
  payload: AssetUploadInitRequest
): Promise<AssetUploadInitResponse> => {
  const response = await fetch("/api/assets/uploads/init", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify(payload),
  });

  await assertOk(response, "Failed to prepare upload.");
  const json = (await parseJson(response)) as AssetUploadInitResponse | null;
  if (!json || typeof json !== "object") {
    throw new Error("Invalid upload preparation response.");
  }
  return json;
};

export const completeAssetUpload = async (assetId: string): Promise<AssetApiRecord> => {
  const response = await fetch(`/api/assets/uploads/${encodeURIComponent(assetId)}/complete`, {
    method: "POST",
    headers: authHeaders(),
  });
  await assertOk(response, "Failed to complete upload.");
  const json = (await parseJson(response)) as AssetApiRecord | null;
  if (!json || typeof json !== "object") {
    throw new Error("Invalid upload completion response.");
  }
  return json;
};

export const fetchRemoteAsset = async (assetId: string): Promise<AssetApiRecord> => {
  const response = await fetch(`/api/assets/${encodeURIComponent(assetId)}`, {
    method: "GET",
    headers: authHeaders(),
  });
  await assertOk(response, "Failed to load remote asset.");
  const json = (await parseJson(response)) as AssetApiRecord | null;
  if (!json || typeof json !== "object") {
    throw new Error("Invalid remote asset response.");
  }
  return json;
};

export const uploadToAssetTarget = async (
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

export const deleteRemoteAsset = async (assetId: string): Promise<void> => {
  const response = await fetch(`/api/assets/${encodeURIComponent(assetId)}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  await assertOk(response, "Failed to delete remote asset.");
};

export interface AssetChangeRecord {
  assetId: string;
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
      typeof candidate.assetId === "string" &&
      typeof candidate.contentHash === "string" &&
      typeof candidate.updatedAt === "string"
    );
  });
};
