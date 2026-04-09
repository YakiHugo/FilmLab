import { createHash } from "node:crypto";
import { imageSize } from "image-size";
import { createId } from "../../../shared/createId";
import { getUserIdFromAuthorizationHeader } from "../auth/user";
import type { AppConfig } from "../config";
import { createAssetCapabilityToken, verifyAssetCapabilityToken } from "./capability";
import type {
  AssetApiRecord,
  AssetEdgeInsert,
  AssetFileKind,
  AssetRecord,
  AssetRepository,
  AssetStorage,
  AssetStorageObject,
  AssetUploadSession,
  CreateGeneratedAssetInput,
  PrepareAssetUploadInput,
  ResolvedProviderAssetRef,
} from "./types";

const DEFAULT_SIGNED_READ_TTL_SECONDS = 15 * 60;

const normalizeMetadata = (value: Record<string, unknown> | undefined) =>
  Object.fromEntries(
    Object.entries(value ?? {}).filter(([, entry]) => entry !== undefined)
  );

const toFileExtension = (mimeType: string) => {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("jpeg")) return "jpg";
  if (mimeType.includes("avif")) return "avif";
  return "bin";
};

const sha256 = (buffer: Buffer) => createHash("sha256").update(buffer).digest("hex");

const IMAGE_TYPE_TO_MIME: Record<string, string> = {
  avif: "image/avif",
  bmp: "image/bmp",
  gif: "image/gif",
  heif: "image/heif",
  heic: "image/heic",
  ico: "image/x-icon",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  tiff: "image/tiff",
  webp: "image/webp",
};

const resolveDetectedMimeType = (mimeType: string, detectedType?: string) => {
  if (mimeType.startsWith("image/")) {
    return mimeType;
  }

  return detectedType ? IMAGE_TYPE_TO_MIME[detectedType] ?? mimeType : mimeType;
};

const measureStoredImageObject = (object: AssetStorageObject) => {
  let dimensions: ReturnType<typeof imageSize>;
  try {
    dimensions = imageSize(object.buffer);
  } catch {
    throw new Error("Stored asset object is not a valid image.");
  }

  return {
    mimeType: resolveDetectedMimeType(object.mimeType, dimensions.type),
    sizeBytes: object.buffer.byteLength,
    width: typeof dimensions.width === "number" ? dimensions.width : null,
    height: typeof dimensions.height === "number" ? dimensions.height : null,
    contentHash: sha256(object.buffer),
  };
};

const isUniqueConstraintError = (error: unknown): error is { code: string } =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { code?: unknown }).code === "23505";

export class AssetService {
  constructor(
    private readonly repository: AssetRepository,
    private readonly storage: AssetStorage,
    private readonly config: AppConfig
  ) {}

  async close() {
    await this.repository.close();
  }

  private buildStoragePaths(userId: string, assetId: string, mimeType: string) {
    const extension = toFileExtension(mimeType);
    return {
      originalPath: `users/${userId}/assets/${assetId}/original.${extension}`,
      thumbnailPath: `users/${userId}/assets/${assetId}/thumbnail.${extension}`,
    };
  }

  private buildBrowserUrl(assetId: string, userId: string, kind: AssetFileKind) {
    const token = createAssetCapabilityToken({
      secret: this.config.assetUrlSecret!,
      userId,
      assetId,
      kind,
    });
    return `/api/assets/${encodeURIComponent(assetId)}/${kind}?token=${encodeURIComponent(token)}`;
  }

  private toApiRecord(record: AssetRecord): AssetApiRecord {
    const hasThumbnail = record.files.some((file) => file.kind === "thumbnail");
    return {
      assetId: record.id,
      name: record.name,
      type: record.mimeType,
      size: record.sizeBytes,
      source: record.source,
      origin: record.origin,
      contentHash: record.contentHash,
      tags: [...record.tags],
      metadata:
        Object.keys(record.metadata).length > 0 ? { ...record.metadata } : undefined,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      objectUrl: this.buildBrowserUrl(record.id, record.ownerUserId, "original"),
      thumbnailUrl: this.buildBrowserUrl(
        record.id,
        record.ownerUserId,
        hasThumbnail ? "thumbnail" : "original"
      ),
    };
  }

  private async removeObjectsBestEffort(paths: Array<string | null | undefined>) {
    const nextPaths = paths.filter(
      (path): path is string => typeof path === "string" && path.trim().length > 0
    );
    if (nextPaths.length === 0) {
      return;
    }

    await this.storage.removeObjects(nextPaths).catch(() => undefined);
  }

  private async loadStoredImage(path: string, label: string) {
    const object = await this.storage.getObject(path);
    if (!object) {
      throw new Error(`${label} is missing from storage.`);
    }

    return {
      path,
      ...measureStoredImageObject(object),
    };
  }

  private buildPreparedUpload(assetId: string, includeThumbnail: boolean) {
    return {
      existing: false as const,
      assetId,
      upload: {
        method: "PUT" as const,
        url: `/api/assets/upload/${encodeURIComponent(assetId)}/original`,
      },
      ...(includeThumbnail
        ? {
            thumbnailUpload: {
              method: "PUT" as const,
              url: `/api/assets/upload/${encodeURIComponent(assetId)}/thumbnail`,
            },
          }
        : {}),
    };
  }

  async prepareUpload(input: PrepareAssetUploadInput) {
    const requestedAssetId =
      typeof input.assetId === "string" && input.assetId.trim().length > 0
        ? input.assetId.trim()
        : null;

    if (requestedAssetId) {
      const existingById = await this.repository.findAssetById(input.userId, requestedAssetId);
      if (existingById && existingById.contentHash === input.contentHash) {
        return {
          existing: true as const,
          assetId: existingById.id,
          asset: this.toApiRecord(existingById),
        };
      }
      if (!existingById) {
        return this.repository.withContentHashLock(
          input.userId,
          input.contentHash,
          async () => {
            const existingByHash = await this.repository.findAssetByContentHash(
              input.userId,
              input.contentHash
            );
            if (existingByHash) {
              return {
                existing: true as const,
                assetId: existingByHash.id,
                asset: this.toApiRecord(existingByHash),
              };
            }

            const existingSession = await this.repository.findUploadSessionByContentHash(
              input.userId,
              input.contentHash
            );
            if (existingSession) {
              return this.buildPreparedUpload(
                existingSession.assetId,
                Boolean(existingSession.thumbnailPath)
              );
            }

            const assetId = requestedAssetId;
            const paths = this.buildStoragePaths(input.userId, assetId, input.mimeType);
            const now = new Date().toISOString();
            const session: AssetUploadSession = {
              assetId,
              ownerUserId: input.userId,
              name: input.name,
              mimeType: input.mimeType,
              sizeBytes: input.sizeBytes,
              source: input.source,
              origin: input.origin,
              contentHash: input.contentHash,
              tags: [...input.tags],
              metadata: normalizeMetadata(input.metadata),
              createdAt: input.createdAt,
              updatedAt: now,
              originalPath: paths.originalPath,
              thumbnailPath: input.includeThumbnail ? paths.thumbnailPath : null,
              originalUploadedAt: null,
              thumbnailUploadedAt: null,
            };
            await this.repository.createUploadSession(session);
            return this.buildPreparedUpload(assetId, input.includeThumbnail ?? false);
          }
        );
      }
    }

    if (!requestedAssetId) {
      return this.repository.withContentHashLock(input.userId, input.contentHash, async () => {
        const existing = await this.repository.findAssetByContentHash(
          input.userId,
          input.contentHash
        );
        if (existing) {
          return {
            existing: true as const,
            assetId: existing.id,
            asset: this.toApiRecord(existing),
          };
        }

        const existingSession = await this.repository.findUploadSessionByContentHash(
          input.userId,
          input.contentHash
        );
        if (existingSession) {
          return this.buildPreparedUpload(
            existingSession.assetId,
            Boolean(existingSession.thumbnailPath)
          );
        }

        const assetId = createId("asset");
        const paths = this.buildStoragePaths(input.userId, assetId, input.mimeType);
        const now = new Date().toISOString();
        const session: AssetUploadSession = {
          assetId,
          ownerUserId: input.userId,
          name: input.name,
          mimeType: input.mimeType,
          sizeBytes: input.sizeBytes,
          source: input.source,
          origin: input.origin,
          contentHash: input.contentHash,
          tags: [...input.tags],
          metadata: normalizeMetadata(input.metadata),
          createdAt: input.createdAt,
          updatedAt: now,
          originalPath: paths.originalPath,
          thumbnailPath: input.includeThumbnail ? paths.thumbnailPath : null,
          originalUploadedAt: null,
          thumbnailUploadedAt: null,
        };
        await this.repository.createUploadSession(session);
        return this.buildPreparedUpload(assetId, input.includeThumbnail ?? false);
      });
    }

    // Re-upload with changed content for an existing assetId.
    const assetId = requestedAssetId ?? createId("asset");
    return this.repository.withContentHashLock(input.userId, input.contentHash, async () => {
      const existingByHash = await this.repository.findAssetByContentHash(
        input.userId,
        input.contentHash
      );
      if (existingByHash) {
        return {
          existing: true as const,
          assetId: existingByHash.id,
          asset: this.toApiRecord(existingByHash),
        };
      }

      const paths = this.buildStoragePaths(input.userId, assetId, input.mimeType);
      const previousSession = await this.repository.getUploadSession(input.userId, assetId);
      const now = new Date().toISOString();
      const session: AssetUploadSession = {
        assetId,
        ownerUserId: input.userId,
        name: input.name,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        source: input.source,
        origin: input.origin,
        contentHash: input.contentHash,
        tags: [...input.tags],
        metadata: normalizeMetadata(input.metadata),
        createdAt: input.createdAt,
        updatedAt: now,
        originalPath: paths.originalPath,
        thumbnailPath: input.includeThumbnail ? paths.thumbnailPath : null,
        originalUploadedAt: null,
        thumbnailUploadedAt: null,
      };
      await this.repository.createUploadSession(session);
      await this.removeObjectsBestEffort([
        previousSession?.originalPath !== session.originalPath ? previousSession?.originalPath : null,
        previousSession?.thumbnailPath !== session.thumbnailPath
          ? previousSession?.thumbnailPath
          : null,
      ]);

      return this.buildPreparedUpload(assetId, input.includeThumbnail ?? false);
    });
  }

  async uploadSessionObject(input: {
    userId: string;
    assetId: string;
    kind: AssetFileKind;
    buffer: Buffer;
    mimeType: string;
  }) {
    const session = await this.repository.getUploadSession(input.userId, input.assetId);
    if (!session) {
      throw new Error("Upload session not found.");
    }
    const path = input.kind === "thumbnail" ? session.thumbnailPath : session.originalPath;
    if (!path) {
      throw new Error("Upload kind is not enabled for this session.");
    }
    if (input.kind === "original" && input.mimeType !== session.mimeType) {
      throw new Error("Original upload MIME type does not match the upload session.");
    }

    await this.storage.putObject({
      path,
      buffer: input.buffer,
      mimeType: input.mimeType,
    });
    await this.repository.markUploadSessionUploaded(
      input.userId,
      input.assetId,
      input.kind,
      new Date().toISOString()
    );
  }

  async completeUpload(userId: string, assetId: string) {
    const session = await this.repository.getUploadSession(userId, assetId);
    if (!session) {
      throw new Error("Upload session not found.");
    }
    if (!session.originalUploadedAt) {
      throw new Error("Original image has not been uploaded.");
    }

    const existingAsset = await this.repository.findAssetById(userId, assetId);
    const original = await this.loadStoredImage(session.originalPath, "Uploaded original image");
    const thumbnail =
      session.thumbnailPath && session.thumbnailUploadedAt
        ? await this.loadStoredImage(session.thumbnailPath, "Uploaded thumbnail image")
        : null;

    return this.repository.withContentHashLock(userId, original.contentHash, async () => {
      const duplicateAsset = await this.repository.findAssetByContentHash(
        userId,
        original.contentHash
      );

      if (duplicateAsset && duplicateAsset.id !== assetId && !existingAsset) {
        await this.removeObjectsBestEffort([session.originalPath, session.thumbnailPath]);
        await this.repository.deleteUploadSession(userId, assetId);
        return this.toApiRecord(duplicateAsset);
      }

      const now = new Date().toISOString();
      const metadata = {
        ...normalizeMetadata(session.metadata),
        ...(original.width != null ? { width: original.width } : {}),
        ...(original.height != null ? { height: original.height } : {}),
      };
      const record: AssetRecord = {
        id: session.assetId,
        ownerUserId: session.ownerUserId,
        name: session.name,
        mimeType: original.mimeType,
        sizeBytes: original.sizeBytes,
        source: session.source,
        origin: session.origin,
        contentHash: original.contentHash,
        tags: [...session.tags],
        metadata,
        createdAt: existingAsset?.createdAt ?? session.createdAt,
        updatedAt: now,
        deletedAt: null,
        files: [
          {
            assetId: session.assetId,
            kind: "original",
            bucket: this.config.supabaseStorageBucket ?? "assets",
            path: session.originalPath,
            mimeType: original.mimeType,
            sizeBytes: original.sizeBytes,
            width: original.width,
            height: original.height,
            createdAt: session.originalUploadedAt!,
            updatedAt: now,
          },
          ...(thumbnail && session.thumbnailPath && session.thumbnailUploadedAt
            ? [
                {
                  assetId: session.assetId,
                  kind: "thumbnail" as const,
                  bucket: this.config.supabaseStorageBucket ?? "assets",
                  path: session.thumbnailPath,
                  mimeType: thumbnail.mimeType,
                  sizeBytes: thumbnail.sizeBytes,
                  width: thumbnail.width,
                  height: thumbnail.height,
                  createdAt: session.thumbnailUploadedAt,
                  updatedAt: now,
                },
              ]
            : []),
        ],
      };

      const saved = await this.repository.saveAsset(record);
      await this.repository.deleteUploadSession(userId, assetId);
      await this.removeObjectsBestEffort(
        (existingAsset?.files ?? [])
          .map((file) =>
            saved.files.some((nextFile) => nextFile.kind === file.kind && nextFile.path === file.path)
              ? null
              : file.path
          )
      );
      return this.toApiRecord(saved);
    });
  }

  async getAsset(userId: string, assetId: string) {
    const asset = await this.repository.findAssetById(userId, assetId);
    return asset ? this.toApiRecord(asset) : null;
  }

  async listChanges(userId: string, since?: string) {
    return this.repository.listAssetChanges(userId, since);
  }

  async resolveBrowserAssetFile(input: {
    assetId: string;
    kind: AssetFileKind;
    token?: string;
    authorization?: string | string[];
  }) {
    const tokenUserId =
      input.token && input.token.trim()
        ? verifyAssetCapabilityToken({
            secret: this.config.assetUrlSecret!,
            token: input.token.trim(),
            assetId: input.assetId,
            kind: input.kind,
          })
        : null;
    const headerUserId = await getUserIdFromAuthorizationHeader(input.authorization, this.config);
    const userId = tokenUserId ?? headerUserId;
    if (!userId) {
      return null;
    }

    const record = await this.repository.findAssetById(userId, input.assetId);
    if (!record) {
      return null;
    }

    const selected =
      record.files.find((file) => file.kind === input.kind) ??
      record.files.find((file) => file.kind === "original") ??
      null;
    if (!selected) {
      return null;
    }

    return this.storage.getObject(selected.path);
  }

  async deleteAsset(userId: string, assetId: string) {
    const record = await this.repository.findAssetById(userId, assetId);
    if (!record) {
      return;
    }
    await this.repository.softDeleteAsset(userId, assetId, new Date().toISOString());
    await this.removeObjectsBestEffort(record.files.map((file) => file.path));
  }

  async createGeneratedAsset(input: CreateGeneratedAssetInput) {
    const measured = measureStoredImageObject({
      buffer: input.buffer,
      mimeType: input.mimeType,
    });
    return this.repository.withContentHashLock(input.userId, measured.contentHash, async () => {
      const existing = await this.repository.findAssetByContentHash(
        input.userId,
        measured.contentHash
      );
      if (existing) {
        return {
          ...this.toApiRecord(existing),
          created: false,
        };
      }

      const assetId = createId("asset");
      const paths = this.buildStoragePaths(input.userId, assetId, measured.mimeType);
      await this.storage.putObject({
        path: paths.originalPath,
        buffer: input.buffer,
        mimeType: measured.mimeType,
      });

      const metadata = {
        ...normalizeMetadata(input.metadata),
        ...(measured.width != null ? { width: measured.width } : {}),
        ...(measured.height != null ? { height: measured.height } : {}),
      };
      const now = new Date().toISOString();
      const record: AssetRecord = {
        id: assetId,
        ownerUserId: input.userId,
        name: input.name,
        mimeType: measured.mimeType,
        sizeBytes: measured.sizeBytes,
        source: input.source,
        origin: input.origin,
        contentHash: measured.contentHash,
        tags: [...(input.tags ?? [])],
        metadata,
        createdAt: input.createdAt,
        updatedAt: now,
        deletedAt: null,
        files: [
          {
            assetId,
            kind: "original",
            bucket: this.config.supabaseStorageBucket ?? "assets",
            path: paths.originalPath,
            mimeType: measured.mimeType,
            sizeBytes: measured.sizeBytes,
            width: measured.width,
            height: measured.height,
            createdAt: now,
            updatedAt: now,
          },
        ],
      };
      try {
        const saved = await this.repository.saveAsset(record);
        return {
          ...this.toApiRecord(saved),
          created: true,
        };
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          await this.removeObjectsBestEffort([paths.originalPath]);
          const duplicate = await this.repository.findAssetByContentHash(
            input.userId,
            measured.contentHash
          );
          if (duplicate) {
            return {
              ...this.toApiRecord(duplicate),
              created: false,
            };
          }
        }
        await this.removeObjectsBestEffort([paths.originalPath]);
        throw error;
      }
    });
  }

  async createAssetEdges(edges: AssetEdgeInsert[]) {
    await this.repository.createAssetEdges(edges);
  }

  async deleteAssetEdges(edgeIds: string[]) {
    await this.repository.deleteAssetEdges(edgeIds);
  }

  async resolveProviderInputAssets(
    userId: string,
    inputAssets: Array<{
      assetId: string;
      binding: "guide" | "source";
      guideType?: "style" | "content" | "controlnet";
      weight?: number;
    }>
  ): Promise<ResolvedProviderAssetRef[]> {
    const resolved: ResolvedProviderAssetRef[] = [];
    for (const inputAsset of inputAssets) {
      const asset = await this.repository.findAssetById(userId, inputAsset.assetId);
      if (!asset) {
        throw new Error(`Referenced asset ${inputAsset.assetId} was not found.`);
      }

      const original = asset.files.find((file) => file.kind === "original");
      if (!original) {
        throw new Error(`Referenced asset ${inputAsset.assetId} is missing its original file.`);
      }

      resolved.push({
        assetId: inputAsset.assetId,
        binding: inputAsset.binding,
        ...(inputAsset.binding === "guide"
          ? {
              guideType: inputAsset.guideType ?? "content",
              weight: typeof inputAsset.weight === "number" ? inputAsset.weight : 1,
            }
          : {}),
        signedUrl: await this.storage.createSignedReadUrl(
          original.path,
          DEFAULT_SIGNED_READ_TTL_SECONDS
        ),
        mimeType: original.mimeType,
      });
    }
    return resolved;
  }
}
