import { Pool } from "pg";
import { createId } from "../../../shared/createId";
import type {
  AssetChangeRecord,
  AssetEdgeInsert,
  AssetFileKind,
  AssetFileRecord,
  AssetRecord,
  AssetRepository,
  AssetUploadSession,
} from "./types";

const parseJsonObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const parseJsonStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];

const rowToFile = (row: Record<string, unknown>): AssetFileRecord => ({
  assetId: String(row.file_asset_id),
  kind: String(row.file_kind) as AssetFileKind,
  bucket: String(row.file_bucket),
  path: String(row.file_storage_path),
  mimeType: String(row.file_mime_type),
  sizeBytes: Number(row.file_size_bytes),
  width: row.file_width == null ? null : Number(row.file_width),
  height: row.file_height == null ? null : Number(row.file_height),
  createdAt: String(row.file_created_at),
  updatedAt: String(row.file_updated_at),
});

const aggregateAssets = (rows: Array<Record<string, unknown>>): AssetRecord[] => {
  const assets = new Map<string, AssetRecord>();
  for (const row of rows) {
    const assetId = String(row.id);
    let asset = assets.get(assetId);
    if (!asset) {
      asset = {
        id: assetId,
        ownerUserId: String(row.owner_user_id),
        name: String(row.name),
        mimeType: String(row.mime_type),
        sizeBytes: Number(row.size_bytes),
        source: String(row.source) as AssetRecord["source"],
        origin: String(row.origin) as AssetRecord["origin"],
        contentHash: String(row.content_hash),
        tags: parseJsonStringArray(row.tags),
        metadata: parseJsonObject(row.metadata),
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
        deletedAt: row.deleted_at ? String(row.deleted_at) : null,
        files: [],
      };
      assets.set(assetId, asset);
    }
    if (row.file_kind) {
      asset.files.push(rowToFile(row));
    }
  }
  return [...assets.values()];
};

class PostgresAssetRepository implements AssetRepository {
  private initPromise: Promise<void> | null = null;

  constructor(private readonly pool: Pool, private readonly bucket: string) {}

  private async ensureReady() {
    if (!this.initPromise) {
      this.initPromise = this.pool.query(`
        CREATE TABLE IF NOT EXISTS asset_upload_sessions (
          asset_id TEXT PRIMARY KEY,
          owner_user_id TEXT NOT NULL,
          name TEXT NOT NULL,
          mime_type TEXT NOT NULL,
          size_bytes BIGINT NOT NULL,
          source TEXT NOT NULL,
          origin TEXT NOT NULL,
          content_hash TEXT NOT NULL,
          tags JSONB NOT NULL DEFAULT '[]'::jsonb,
          metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL,
          original_path TEXT NOT NULL,
          thumbnail_path TEXT NULL,
          original_uploaded_at TIMESTAMPTZ NULL,
          thumbnail_uploaded_at TIMESTAMPTZ NULL
        );

        CREATE TABLE IF NOT EXISTS assets (
          id TEXT PRIMARY KEY,
          owner_user_id TEXT NOT NULL,
          name TEXT NOT NULL,
          mime_type TEXT NOT NULL,
          size_bytes BIGINT NOT NULL,
          source TEXT NOT NULL,
          origin TEXT NOT NULL,
          content_hash TEXT NOT NULL,
          tags JSONB NOT NULL DEFAULT '[]'::jsonb,
          metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL,
          deleted_at TIMESTAMPTZ NULL
        );
        DROP INDEX IF EXISTS assets_owner_hash_active_idx;
        CREATE INDEX IF NOT EXISTS assets_owner_hash_active_idx
          ON assets(owner_user_id, content_hash)
          WHERE deleted_at IS NULL;
        CREATE INDEX IF NOT EXISTS assets_owner_updated_active_idx
          ON assets(owner_user_id, updated_at DESC)
          WHERE deleted_at IS NULL;

        CREATE TABLE IF NOT EXISTS asset_files (
          id TEXT PRIMARY KEY,
          asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
          kind TEXT NOT NULL,
          bucket TEXT NOT NULL,
          storage_path TEXT NOT NULL,
          mime_type TEXT NOT NULL,
          size_bytes BIGINT NOT NULL,
          width INTEGER NULL,
          height INTEGER NULL,
          created_at TIMESTAMPTZ NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL,
          UNIQUE (asset_id, kind)
        );
        CREATE INDEX IF NOT EXISTS asset_files_asset_kind_idx
          ON asset_files(asset_id, kind);

        CREATE TABLE IF NOT EXISTS asset_edges (
          id TEXT PRIMARY KEY,
          source_asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
          target_asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
          edge_type TEXT NOT NULL,
          conversation_id TEXT NULL,
          run_id TEXT NULL,
          created_at TIMESTAMPTZ NOT NULL
        );
        CREATE INDEX IF NOT EXISTS asset_edges_source_idx
          ON asset_edges(source_asset_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS asset_edges_target_idx
          ON asset_edges(target_asset_id, created_at DESC);
      `).then(() => undefined);
    }
    await this.initPromise;
  }

  private async loadAssets(whereSql: string, params: unknown[]) {
    await this.ensureReady();
    const result = await this.pool.query(
      `
        SELECT
          assets.id,
          assets.owner_user_id,
          assets.name,
          assets.mime_type,
          assets.size_bytes,
          assets.source,
          assets.origin,
          assets.content_hash,
          assets.tags,
          assets.metadata,
          assets.created_at,
          assets.updated_at,
          assets.deleted_at,
          asset_files.asset_id AS file_asset_id,
          asset_files.kind AS file_kind,
          asset_files.bucket AS file_bucket,
          asset_files.storage_path AS file_storage_path,
          asset_files.mime_type AS file_mime_type,
          asset_files.size_bytes AS file_size_bytes,
          asset_files.width AS file_width,
          asset_files.height AS file_height,
          asset_files.created_at AS file_created_at,
          asset_files.updated_at AS file_updated_at
        FROM assets
        LEFT JOIN asset_files
          ON asset_files.asset_id = assets.id
        ${whereSql}
        ORDER BY assets.updated_at DESC, asset_files.kind ASC
      `,
      params
    );
    return aggregateAssets(result.rows);
  }

  async close() {}

  async findAssetById(userId: string, assetId: string) {
    const assets = await this.loadAssets(
      "WHERE assets.owner_user_id = $1 AND assets.id = $2 AND assets.deleted_at IS NULL",
      [userId, assetId]
    );
    return assets[0] ?? null;
  }

  async findAssetByContentHash(userId: string, contentHash: string) {
    const assets = await this.loadAssets(
      "WHERE assets.owner_user_id = $1 AND assets.content_hash = $2 AND assets.deleted_at IS NULL",
      [userId, contentHash]
    );
    return assets[0] ?? null;
  }

  async listAssetChanges(userId: string, since?: string) {
    await this.ensureReady();
    const result = await this.pool.query(
      `
        SELECT id AS asset_id, content_hash, updated_at, deleted_at
        FROM assets
        WHERE owner_user_id = $1
          AND ($2::timestamptz IS NULL OR updated_at > $2::timestamptz)
        ORDER BY updated_at DESC
      `,
      [userId, since ?? null]
    );
    return result.rows.map(
      (row): AssetChangeRecord => ({
        assetId: String(row.asset_id),
        contentHash: String(row.content_hash),
        updatedAt: String(row.updated_at),
        ...(row.deleted_at ? { deletedAt: String(row.deleted_at) } : {}),
      })
    );
  }

  async createUploadSession(session: AssetUploadSession) {
    await this.ensureReady();
    await this.pool.query(
      `
        INSERT INTO asset_upload_sessions (
          asset_id,
          owner_user_id,
          name,
          mime_type,
          size_bytes,
          source,
          origin,
          content_hash,
          tags,
          metadata,
          created_at,
          updated_at,
          original_path,
          thumbnail_path,
          original_uploaded_at,
          thumbnail_uploaded_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, $12, $13, $14, $15, $16
        )
        ON CONFLICT (asset_id) DO UPDATE SET
          owner_user_id = EXCLUDED.owner_user_id,
          name = EXCLUDED.name,
          mime_type = EXCLUDED.mime_type,
          size_bytes = EXCLUDED.size_bytes,
          source = EXCLUDED.source,
          origin = EXCLUDED.origin,
          content_hash = EXCLUDED.content_hash,
          tags = EXCLUDED.tags,
          metadata = EXCLUDED.metadata,
          created_at = EXCLUDED.created_at,
          updated_at = EXCLUDED.updated_at,
          original_path = EXCLUDED.original_path,
          thumbnail_path = EXCLUDED.thumbnail_path,
          original_uploaded_at = EXCLUDED.original_uploaded_at,
          thumbnail_uploaded_at = EXCLUDED.thumbnail_uploaded_at
      `,
      [
        session.assetId,
        session.ownerUserId,
        session.name,
        session.mimeType,
        session.sizeBytes,
        session.source,
        session.origin,
        session.contentHash,
        JSON.stringify(session.tags),
        JSON.stringify(session.metadata),
        session.createdAt,
        session.updatedAt,
        session.originalPath,
        session.thumbnailPath,
        session.originalUploadedAt,
        session.thumbnailUploadedAt,
      ]
    );
  }

  async getUploadSession(userId: string, assetId: string) {
    await this.ensureReady();
    const result = await this.pool.query(
      "SELECT * FROM asset_upload_sessions WHERE owner_user_id = $1 AND asset_id = $2",
      [userId, assetId]
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return {
      assetId: String(row.asset_id),
      ownerUserId: String(row.owner_user_id),
      name: String(row.name),
      mimeType: String(row.mime_type),
      sizeBytes: Number(row.size_bytes),
      source: String(row.source) as AssetUploadSession["source"],
      origin: String(row.origin) as AssetUploadSession["origin"],
      contentHash: String(row.content_hash),
      tags: parseJsonStringArray(row.tags),
      metadata: parseJsonObject(row.metadata),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      originalPath: String(row.original_path),
      thumbnailPath: row.thumbnail_path ? String(row.thumbnail_path) : null,
      originalUploadedAt: row.original_uploaded_at ? String(row.original_uploaded_at) : null,
      thumbnailUploadedAt: row.thumbnail_uploaded_at ? String(row.thumbnail_uploaded_at) : null,
    };
  }

  async findUploadSessionByContentHash(userId: string, contentHash: string) {
    await this.ensureReady();
    const result = await this.pool.query(
      `
        SELECT *
        FROM asset_upload_sessions
        WHERE owner_user_id = $1 AND content_hash = $2
        ORDER BY updated_at DESC
        LIMIT 1
      `,
      [userId, contentHash]
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return {
      assetId: String(row.asset_id),
      ownerUserId: String(row.owner_user_id),
      name: String(row.name),
      mimeType: String(row.mime_type),
      sizeBytes: Number(row.size_bytes),
      source: String(row.source) as AssetUploadSession["source"],
      origin: String(row.origin) as AssetUploadSession["origin"],
      contentHash: String(row.content_hash),
      tags: parseJsonStringArray(row.tags),
      metadata: parseJsonObject(row.metadata),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      originalPath: String(row.original_path),
      thumbnailPath: row.thumbnail_path ? String(row.thumbnail_path) : null,
      originalUploadedAt: row.original_uploaded_at ? String(row.original_uploaded_at) : null,
      thumbnailUploadedAt: row.thumbnail_uploaded_at ? String(row.thumbnail_uploaded_at) : null,
    };
  }

  async markUploadSessionUploaded(
    userId: string,
    assetId: string,
    kind: AssetFileKind,
    uploadedAt: string
  ) {
    await this.ensureReady();
    const column = kind === "thumbnail" ? "thumbnail_uploaded_at" : "original_uploaded_at";
    await this.pool.query(
      `
        UPDATE asset_upload_sessions
        SET ${column} = $3, updated_at = $3
        WHERE owner_user_id = $1 AND asset_id = $2
      `,
      [userId, assetId, uploadedAt]
    );
  }

  async deleteUploadSession(userId: string, assetId: string) {
    await this.ensureReady();
    await this.pool.query(
      "DELETE FROM asset_upload_sessions WHERE owner_user_id = $1 AND asset_id = $2",
      [userId, assetId]
    );
  }

  async withContentHashLock<T>(
    userId: string,
    contentHash: string,
    operation: () => Promise<T>
  ) {
    await this.ensureReady();
    const client = await this.pool.connect();
    try {
      await client.query(
        "SELECT pg_advisory_lock(hashtext($1), hashtext($2))",
        [userId, contentHash]
      );
      return await operation();
    } finally {
      try {
        await client.query(
          "SELECT pg_advisory_unlock(hashtext($1), hashtext($2))",
          [userId, contentHash]
        );
      } finally {
        client.release();
      }
    }
  }

  async saveAsset(record: AssetRecord) {
    await this.ensureReady();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `
          INSERT INTO assets (
            id,
            owner_user_id,
            name,
            mime_type,
            size_bytes,
            source,
            origin,
            content_hash,
            tags,
            metadata,
            created_at,
            updated_at,
            deleted_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, $12, $13
          )
          ON CONFLICT (id) DO UPDATE SET
            owner_user_id = EXCLUDED.owner_user_id,
            name = EXCLUDED.name,
            mime_type = EXCLUDED.mime_type,
            size_bytes = EXCLUDED.size_bytes,
            source = EXCLUDED.source,
            origin = EXCLUDED.origin,
            content_hash = EXCLUDED.content_hash,
            tags = EXCLUDED.tags,
            metadata = EXCLUDED.metadata,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at
        `,
        [
          record.id,
          record.ownerUserId,
          record.name,
          record.mimeType,
          record.sizeBytes,
          record.source,
          record.origin,
          record.contentHash,
          JSON.stringify(record.tags),
          JSON.stringify(record.metadata),
          record.createdAt,
          record.updatedAt,
          record.deletedAt,
        ]
      );

      await client.query("DELETE FROM asset_files WHERE asset_id = $1", [record.id]);

      for (const file of record.files) {
        await client.query(
          `
            INSERT INTO asset_files (
              id,
              asset_id,
              kind,
              bucket,
              storage_path,
              mime_type,
              size_bytes,
              width,
              height,
              created_at,
              updated_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
            )
          `,
          [
            createId("asset-file"),
            file.assetId,
            file.kind,
            file.bucket,
            file.path,
            file.mimeType,
            file.sizeBytes,
            file.width,
            file.height,
            file.createdAt,
            file.updatedAt,
          ]
        );
      }

      await client.query("COMMIT");
      return record;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async createAssetEdges(edges: AssetEdgeInsert[]) {
    await this.ensureReady();
    if (edges.length === 0) {
      return;
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      for (const edge of edges) {
        await client.query(
          `
            INSERT INTO asset_edges (
              id,
              source_asset_id,
              target_asset_id,
              edge_type,
              conversation_id,
              run_id,
              created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          `,
          [
            edge.id,
            edge.sourceAssetId,
            edge.targetAssetId,
            edge.edgeType,
            edge.conversationId ?? null,
            edge.runId ?? null,
            edge.createdAt,
          ]
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteAssetEdges(edgeIds: string[]) {
    await this.ensureReady();
    if (edgeIds.length === 0) {
      return;
    }

    await this.pool.query(
      `
        DELETE FROM asset_edges
        WHERE id = ANY($1::text[])
      `,
      [edgeIds]
    );
  }

  async softDeleteAsset(userId: string, assetId: string, deletedAt: string) {
    await this.ensureReady();
    await this.pool.query(
      `
        UPDATE assets
        SET deleted_at = $3, updated_at = $3
        WHERE owner_user_id = $1 AND id = $2 AND deleted_at IS NULL
      `,
      [userId, assetId, deletedAt]
    );
  }
}

class MemoryAssetRepository implements AssetRepository {
  private readonly assets = new Map<string, AssetRecord>();
  private readonly uploadSessions = new Map<string, AssetUploadSession>();
  private readonly contentHashLocks = new Map<string, Promise<void>>();

  async close() {}

  async findAssetById(userId: string, assetId: string) {
    const asset = this.assets.get(assetId);
    return asset && asset.ownerUserId === userId && !asset.deletedAt ? structuredClone(asset) : null;
  }

  async findAssetByContentHash(userId: string, contentHash: string) {
    for (const asset of this.assets.values()) {
      if (asset.ownerUserId === userId && asset.contentHash === contentHash && !asset.deletedAt) {
        return structuredClone(asset);
      }
    }
    return null;
  }

  async listAssetChanges(userId: string, since?: string) {
    return [...this.assets.values()]
      .filter(
        (asset) =>
          asset.ownerUserId === userId &&
          (!since || Date.parse(asset.updatedAt) > Date.parse(since))
      )
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
      .map((asset) => ({
        assetId: asset.id,
        contentHash: asset.contentHash,
        updatedAt: asset.updatedAt,
        ...(asset.deletedAt ? { deletedAt: asset.deletedAt } : {}),
      }));
  }

  async createUploadSession(session: AssetUploadSession) {
    this.uploadSessions.set(session.assetId, structuredClone(session));
  }

  async getUploadSession(userId: string, assetId: string) {
    const session = this.uploadSessions.get(assetId);
    return session && session.ownerUserId === userId ? structuredClone(session) : null;
  }

  async findUploadSessionByContentHash(userId: string, contentHash: string) {
    const matches = [...this.uploadSessions.values()]
      .filter((session) => session.ownerUserId === userId && session.contentHash === contentHash)
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
    return matches[0] ? structuredClone(matches[0]) : null;
  }

  async markUploadSessionUploaded(
    userId: string,
    assetId: string,
    kind: AssetFileKind,
    uploadedAt: string
  ) {
    const session = this.uploadSessions.get(assetId);
    if (!session || session.ownerUserId !== userId) {
      return;
    }
    if (kind === "thumbnail") {
      session.thumbnailUploadedAt = uploadedAt;
    } else {
      session.originalUploadedAt = uploadedAt;
    }
    session.updatedAt = uploadedAt;
  }

  async deleteUploadSession(userId: string, assetId: string) {
    const session = this.uploadSessions.get(assetId);
    if (session?.ownerUserId === userId) {
      this.uploadSessions.delete(assetId);
    }
  }

  async withContentHashLock<T>(
    userId: string,
    contentHash: string,
    operation: () => Promise<T>
  ) {
    const key = `${userId}:${contentHash}`;
    const previous = this.contentHashLocks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const chained = previous.then(() => current);
    this.contentHashLocks.set(key, chained);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.contentHashLocks.get(key) === chained) {
        this.contentHashLocks.delete(key);
      }
    }
  }

  async saveAsset(record: AssetRecord) {
    this.assets.set(record.id, structuredClone(record));
    return structuredClone(record);
  }

  async createAssetEdges(_edges: AssetEdgeInsert[]) {}

  async deleteAssetEdges(_edgeIds: string[]) {}

  async softDeleteAsset(userId: string, assetId: string, deletedAt: string) {
    const asset = this.assets.get(assetId);
    if (asset && asset.ownerUserId === userId && !asset.deletedAt) {
      asset.deletedAt = deletedAt;
      asset.updatedAt = deletedAt;
    }
  }
}

export const createAssetRepository = (pool: Pool | null, bucket: string): AssetRepository =>
  pool ? new PostgresAssetRepository(pool, bucket) : new MemoryAssetRepository();
