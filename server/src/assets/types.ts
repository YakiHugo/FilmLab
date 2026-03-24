import type { PersistedAssetEdgeType } from "../../../shared/chatImageTypes";

export type AssetSource = "imported" | "ai-generated";
export type AssetFileKind = "original" | "thumbnail";
export type AssetOrigin = "file" | "url" | "ai";

export interface AssetFileRecord {
  assetId: string;
  kind: AssetFileKind;
  bucket: string;
  path: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface AssetRecord {
  id: string;
  ownerUserId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  source: AssetSource;
  origin: AssetOrigin;
  contentHash: string;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  files: AssetFileRecord[];
}

export interface AssetUploadSession {
  assetId: string;
  ownerUserId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  source: AssetSource;
  origin: AssetOrigin;
  contentHash: string;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  originalPath: string;
  thumbnailPath: string | null;
  originalUploadedAt: string | null;
  thumbnailUploadedAt: string | null;
}

export interface AssetApiRecord {
  assetId: string;
  name: string;
  type: string;
  size: number;
  source: AssetSource;
  origin: AssetOrigin;
  contentHash: string;
  tags: string[];
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  objectUrl: string;
  thumbnailUrl: string;
}

export interface AssetChangeRecord {
  assetId: string;
  contentHash: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface AssetUploadTarget {
  method: "PUT";
  url: string;
  headers?: Record<string, string>;
}

export interface PreparedAssetUpload {
  existing: boolean;
  assetId: string;
  asset?: AssetApiRecord;
  upload?: AssetUploadTarget;
  thumbnailUpload?: AssetUploadTarget;
}

export interface PrepareAssetUploadInput {
  assetId?: string;
  userId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  source: AssetSource;
  origin: AssetOrigin;
  contentHash: string;
  tags: string[];
  metadata?: Record<string, unknown>;
  includeThumbnail?: boolean;
}

export interface CreateGeneratedAssetInput {
  userId: string;
  name: string;
  mimeType: string;
  buffer: Buffer;
  createdAt: string;
  source: "ai-generated";
  origin: "ai";
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface AssetEdgeInsert {
  id: string;
  sourceAssetId: string;
  targetAssetId: string;
  edgeType: PersistedAssetEdgeType;
  conversationId?: string | null;
  runId?: string | null;
  createdAt: string;
}

export interface ResolvedProviderAssetRef {
  assetId: string;
  role: "reference" | "edit" | "variation";
  referenceType: "style" | "content" | "controlnet";
  weight: number;
  signedUrl: string;
  mimeType: string;
}

export interface AssetStorageObject {
  buffer: Buffer;
  mimeType: string;
}

export interface AssetStorage {
  putObject(input: {
    path: string;
    buffer: Buffer;
    mimeType: string;
  }): Promise<void>;
  getObject(path: string): Promise<AssetStorageObject | null>;
  removeObjects(paths: string[]): Promise<void>;
  createSignedReadUrl(path: string, expiresInSeconds: number): Promise<string>;
}

export interface AssetRepository {
  close(): Promise<void>;
  findAssetById(userId: string, assetId: string): Promise<AssetRecord | null>;
  findAssetByContentHash(userId: string, contentHash: string): Promise<AssetRecord | null>;
  listAssetChanges(userId: string, since?: string): Promise<AssetChangeRecord[]>;
  createUploadSession(session: AssetUploadSession): Promise<void>;
  getUploadSession(userId: string, assetId: string): Promise<AssetUploadSession | null>;
  findUploadSessionByContentHash(
    userId: string,
    contentHash: string
  ): Promise<AssetUploadSession | null>;
  markUploadSessionUploaded(
    userId: string,
    assetId: string,
    kind: AssetFileKind,
    uploadedAt: string
  ): Promise<void>;
  deleteUploadSession(userId: string, assetId: string): Promise<void>;
  withContentHashLock<T>(
    userId: string,
    contentHash: string,
    operation: () => Promise<T>
  ): Promise<T>;
  saveAsset(record: AssetRecord): Promise<AssetRecord>;
  createAssetEdges(edges: AssetEdgeInsert[]): Promise<void>;
  deleteAssetEdges(edgeIds: string[]): Promise<void>;
  softDeleteAsset(userId: string, assetId: string, deletedAt: string): Promise<void>;
}
