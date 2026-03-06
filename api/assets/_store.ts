import type { AssetOrigin } from "../../src/types";

type AssetSource = "imported" | "ai-generated";

type UploadTarget = {
  method: "PUT";
  url: string;
  headers?: Record<string, string>;
};

export interface ServerAssetRecord {
  remoteAssetId: string;
  userId: string;
  contentHash: string;
  source: AssetSource;
  origin: AssetOrigin;
  objectKey: string;
  thumbnailKey?: string;
  metadata?: Record<string, unknown>;
  tags: string[];
  name: string;
  type: string;
  size: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

interface UploadSession {
  remoteAssetId: string;
  userId: string;
  objectKey: string;
  thumbnailKey?: string;
  upload?: UploadTarget;
  thumbnailUpload?: UploadTarget;
  createdAt: string;
}

interface AssetServerState {
  assetsById: Map<string, ServerAssetRecord>;
  hashIndex: Map<string, string>;
  objectBlobs: Map<string, Buffer>;
  uploadSessions: Map<string, UploadSession>;
}

const getState = (): AssetServerState => {
  const scoped = globalThis as typeof globalThis & { __FILMLAB_ASSET_SERVER__?: AssetServerState };
  if (!scoped.__FILMLAB_ASSET_SERVER__) {
    scoped.__FILMLAB_ASSET_SERVER__ = {
      assetsById: new Map(),
      hashIndex: new Map(),
      objectBlobs: new Map(),
      uploadSessions: new Map(),
    };
  }
  return scoped.__FILMLAB_ASSET_SERVER__;
};

const hashKey = (userId: string, contentHash: string) => `${userId}:${contentHash}`;

const dynamicImport = async (modulePath: string) => {
  const importer = new Function("path", "return import(path);") as (
    path: string
  ) => Promise<Record<string, unknown>>;
  return importer(modulePath);
};

const resolveDbUrl = () => process.env.ASSET_DATABASE_URL || process.env.DATABASE_URL || "";
const resolveS3Bucket = () => process.env.ASSET_S3_BUCKET || process.env.S3_BUCKET || "";
const resolveS3Region = () => process.env.ASSET_S3_REGION || process.env.AWS_REGION || "us-east-1";

const resolveS3Endpoint = () => {
  const endpoint = process.env.ASSET_S3_ENDPOINT || process.env.S3_ENDPOINT;
  return endpoint && endpoint.trim() ? endpoint.trim() : undefined;
};

const resolveS3ForcePathStyle = () => {
  const value = process.env.ASSET_S3_FORCE_PATH_STYLE || process.env.S3_FORCE_PATH_STYLE || "";
  return value.toLowerCase() === "true" || value === "1";
};

const resolveSignedUrlTtlSeconds = () => {
  const raw = Number(process.env.ASSET_S3_SIGNED_URL_TTL_SECONDS || 900);
  if (!Number.isFinite(raw)) {
    return 900;
  }
  return Math.min(3600, Math.max(60, Math.round(raw)));
};

const canUsePostgresS3 = () => Boolean(resolveDbUrl()) && Boolean(resolveS3Bucket());

type PostgresS3Resources = {
  pool: {
    query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
  };
  s3Client: {
    send: (command: unknown) => Promise<unknown>;
  };
  commands: {
    PutObjectCommand: new (input: Record<string, unknown>) => unknown;
    HeadObjectCommand: new (input: Record<string, unknown>) => unknown;
    DeleteObjectCommand: new (input: Record<string, unknown>) => unknown;
  };
  getSignedUrl: (client: unknown, command: unknown, options: { expiresIn: number }) => Promise<string>;
  bucket: string;
  signedUrlTtlSeconds: number;
};

let postgresS3InitPromise: Promise<PostgresS3Resources | null> | null = null;

const initPostgresS3Resources = async (): Promise<PostgresS3Resources | null> => {
  if (!canUsePostgresS3()) {
    return null;
  }

  try {
    const [{ Pool }, awsModule, presignerModule] = await Promise.all([
      dynamicImport("pg"),
      dynamicImport("@aws-sdk/client-s3"),
      dynamicImport("@aws-sdk/s3-request-presigner"),
    ]);

    const PoolCtor = Pool as new (config: { connectionString: string }) => {
      query: (
        sql: string,
        params?: unknown[]
      ) => Promise<{ rows: Array<Record<string, unknown>> }>;
    };

    const S3ClientCtor = awsModule.S3Client as new (config: {
      region: string;
      endpoint?: string;
      forcePathStyle?: boolean;
    }) => {
      send: (command: unknown) => Promise<unknown>;
    };

    const PutObjectCommand = awsModule.PutObjectCommand as new (
      input: Record<string, unknown>
    ) => unknown;
    const HeadObjectCommand = awsModule.HeadObjectCommand as new (
      input: Record<string, unknown>
    ) => unknown;
    const DeleteObjectCommand = awsModule.DeleteObjectCommand as new (
      input: Record<string, unknown>
    ) => unknown;

    const getSignedUrl = presignerModule.getSignedUrl as (
      client: unknown,
      command: unknown,
      options: { expiresIn: number }
    ) => Promise<string>;

    const pool = new PoolCtor({
      connectionString: resolveDbUrl(),
    });

    await pool.query(`
      CREATE TABLE IF NOT EXISTS asset_metadata (
        asset_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        source TEXT NOT NULL,
        origin TEXT NOT NULL,
        object_key TEXT NOT NULL,
        thumbnail_key TEXT,
        metadata JSONB,
        tags JSONB NOT NULL DEFAULT '[]'::jsonb,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        size BIGINT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        deleted_at TIMESTAMPTZ,
        UNIQUE (user_id, content_hash)
      );
    `);
    await pool.query(
      "CREATE INDEX IF NOT EXISTS asset_metadata_user_updated_idx ON asset_metadata(user_id, updated_at DESC);"
    );
    await pool.query(`
      CREATE TABLE IF NOT EXISTS asset_upload_sessions (
        remote_asset_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        object_key TEXT NOT NULL,
        thumbnail_key TEXT,
        created_at TIMESTAMPTZ NOT NULL
      );
    `);

    const s3Client = new S3ClientCtor({
      region: resolveS3Region(),
      endpoint: resolveS3Endpoint(),
      forcePathStyle: resolveS3ForcePathStyle(),
    });

    return {
      pool,
      s3Client,
      commands: {
        PutObjectCommand,
        HeadObjectCommand,
        DeleteObjectCommand,
      },
      getSignedUrl,
      bucket: resolveS3Bucket(),
      signedUrlTtlSeconds: resolveSignedUrlTtlSeconds(),
    };
  } catch (error) {
    console.warn("Asset store fallback to memory: Postgres/S3 adapter init failed.", error);
    return null;
  }
};

const getPostgresS3Resources = async (): Promise<PostgresS3Resources | null> => {
  if (!postgresS3InitPromise) {
    postgresS3InitPromise = initPostgresS3Resources();
  }
  return postgresS3InitPromise;
};

const parseJsonValue = (value: unknown): Record<string, unknown> | undefined => {
  if (!value) {
    return undefined;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return undefined;
    }
  }
  if (typeof value === "object") {
    return value as Record<string, unknown>;
  }
  return undefined;
};

const parseJsonArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === "string");
      }
    } catch {
      return [];
    }
  }
  return [];
};

const toServerAssetRecord = (row: Record<string, unknown>): ServerAssetRecord => ({
  remoteAssetId: String(row.asset_id ?? ""),
  userId: String(row.user_id ?? ""),
  contentHash: String(row.content_hash ?? ""),
  source: (row.source as AssetSource) ?? "imported",
  origin: (row.origin as AssetOrigin) ?? "file",
  objectKey: String(row.object_key ?? ""),
  thumbnailKey: typeof row.thumbnail_key === "string" ? row.thumbnail_key : undefined,
  metadata: parseJsonValue(row.metadata),
  tags: parseJsonArray(row.tags),
  name: String(row.name ?? ""),
  type: String(row.type ?? ""),
  size: Number(row.size ?? 0),
  createdAt: new Date(String(row.created_at ?? new Date().toISOString())).toISOString(),
  updatedAt: new Date(String(row.updated_at ?? new Date().toISOString())).toISOString(),
  deletedAt: row.deleted_at ? new Date(String(row.deleted_at)).toISOString() : undefined,
});

const buildLocalUploadTargets = (remoteAssetId: string): {
  upload: UploadTarget;
  thumbnailUpload: UploadTarget;
} => ({
  upload: {
    method: "PUT",
    url: `/api/assets/upload/${encodeURIComponent(remoteAssetId)}/original`,
  },
  thumbnailUpload: {
    method: "PUT",
    url: `/api/assets/upload/${encodeURIComponent(remoteAssetId)}/thumbnail`,
  },
});

const buildSignedUploadTargets = async (
  resources: PostgresS3Resources,
  objectKey: string,
  thumbnailKey?: string
): Promise<{ upload: UploadTarget; thumbnailUpload?: UploadTarget }> => {
  const { PutObjectCommand } = resources.commands;
  const uploadCommand = new PutObjectCommand({
    Bucket: resources.bucket,
    Key: objectKey,
  });

  const uploadUrl = await resources.getSignedUrl(resources.s3Client, uploadCommand, {
    expiresIn: resources.signedUrlTtlSeconds,
  });

  if (!thumbnailKey) {
    return {
      upload: {
        method: "PUT",
        url: uploadUrl,
      },
    };
  }

  const thumbnailCommand = new PutObjectCommand({
    Bucket: resources.bucket,
    Key: thumbnailKey,
  });
  const thumbnailUrl = await resources.getSignedUrl(resources.s3Client, thumbnailCommand, {
    expiresIn: resources.signedUrlTtlSeconds,
  });

  return {
    upload: {
      method: "PUT",
      url: uploadUrl,
    },
    thumbnailUpload: {
      method: "PUT",
      url: thumbnailUrl,
    },
  };
};

export const createRemoteAssetId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `remote-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const buildObjectKeys = (userId: string, remoteAssetId: string) => ({
  objectKey: `users/${userId}/assets/${remoteAssetId}/original`,
  thumbnailKey: `users/${userId}/assets/${remoteAssetId}/thumbnail`,
});

export const createUploadSession = async (session: {
  remoteAssetId: string;
  userId: string;
  objectKey: string;
  thumbnailKey?: string;
  createdAt: string;
}): Promise<UploadSession> => {
  const resources = await getPostgresS3Resources();
  const targets = resources
    ? await buildSignedUploadTargets(resources, session.objectKey, session.thumbnailKey)
    : buildLocalUploadTargets(session.remoteAssetId);

  const uploadSession: UploadSession = {
    ...session,
    upload: targets.upload,
    thumbnailUpload: targets.thumbnailUpload,
  };
  if (resources) {
    await resources.pool.query(
      `
        INSERT INTO asset_upload_sessions (
          remote_asset_id,
          user_id,
          object_key,
          thumbnail_key,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5::timestamptz)
        ON CONFLICT (remote_asset_id)
        DO UPDATE SET
          user_id = EXCLUDED.user_id,
          object_key = EXCLUDED.object_key,
          thumbnail_key = EXCLUDED.thumbnail_key,
          created_at = EXCLUDED.created_at;
      `,
      [
        session.remoteAssetId,
        session.userId,
        session.objectKey,
        session.thumbnailKey ?? null,
        session.createdAt,
      ]
    );
  } else {
    getState().uploadSessions.set(session.remoteAssetId, uploadSession);
  }
  return uploadSession;
};

export const getUploadSession = async (
  userId: string,
  remoteAssetId: string
): Promise<UploadSession | null> => {
  const resources = await getPostgresS3Resources();
  if (!resources) {
    const session = getState().uploadSessions.get(remoteAssetId);
    if (!session || session.userId !== userId) {
      return null;
    }
    return session;
  }

  const result = await resources.pool.query(
    `
      SELECT remote_asset_id, user_id, object_key, thumbnail_key, created_at
      FROM asset_upload_sessions
      WHERE remote_asset_id = $1
        AND user_id = $2
      LIMIT 1;
    `,
    [remoteAssetId, userId]
  );
  const row = result.rows[0];
  if (!row) {
    return null;
  }
  return {
    remoteAssetId: String(row.remote_asset_id ?? ""),
    userId: String(row.user_id ?? ""),
    objectKey: String(row.object_key ?? ""),
    thumbnailKey: typeof row.thumbnail_key === "string" ? row.thumbnail_key : undefined,
    createdAt: new Date(String(row.created_at ?? new Date().toISOString())).toISOString(),
  };
};

export const finishUploadSession = async (remoteAssetId: string) => {
  const resources = await getPostgresS3Resources();
  if (!resources) {
    getState().uploadSessions.delete(remoteAssetId);
    return;
  }
  await resources.pool.query(
    `
      DELETE FROM asset_upload_sessions
      WHERE remote_asset_id = $1;
    `,
    [remoteAssetId]
  );
};

export const findAssetByHash = async (
  userId: string,
  contentHash: string
): Promise<ServerAssetRecord | null> => {
  const resources = await getPostgresS3Resources();
  if (!resources) {
    const state = getState();
    const indexedId = state.hashIndex.get(hashKey(userId, contentHash));
    if (!indexedId) {
      return null;
    }
    const record = state.assetsById.get(indexedId);
    if (!record || record.deletedAt) {
      return null;
    }
    return record;
  }

  const result = await resources.pool.query(
    `
      SELECT *
      FROM asset_metadata
      WHERE user_id = $1
        AND content_hash = $2
        AND deleted_at IS NULL
      LIMIT 1;
    `,
    [userId, contentHash]
  );

  const row = result.rows[0];
  return row ? toServerAssetRecord(row) : null;
};

export const getAssetById = async (
  userId: string,
  remoteAssetId: string
): Promise<ServerAssetRecord | null> => {
  const resources = await getPostgresS3Resources();
  if (!resources) {
    const record = getState().assetsById.get(remoteAssetId);
    if (!record || record.userId !== userId) {
      return null;
    }
    return record;
  }

  const result = await resources.pool.query(
    `
      SELECT *
      FROM asset_metadata
      WHERE user_id = $1
        AND asset_id = $2
      LIMIT 1;
    `,
    [userId, remoteAssetId]
  );

  const row = result.rows[0];
  return row ? toServerAssetRecord(row) : null;
};

export const putObjectBinary = async (objectKey: string, buffer: Buffer) => {
  const resources = await getPostgresS3Resources();
  if (!resources) {
    getState().objectBlobs.set(objectKey, buffer);
    return;
  }

  const { PutObjectCommand } = resources.commands;
  await resources.s3Client.send(
    new PutObjectCommand({
      Bucket: resources.bucket,
      Key: objectKey,
      Body: buffer,
    })
  );
};

export const hasObjectBinary = async (objectKey: string): Promise<boolean> => {
  const resources = await getPostgresS3Resources();
  if (!resources) {
    return getState().objectBlobs.has(objectKey);
  }

  try {
    const { HeadObjectCommand } = resources.commands;
    await resources.s3Client.send(
      new HeadObjectCommand({
        Bucket: resources.bucket,
        Key: objectKey,
      })
    );
    return true;
  } catch {
    return false;
  }
};

export const upsertAssetRecord = async (record: ServerAssetRecord) => {
  const resources = await getPostgresS3Resources();
  if (!resources) {
    const state = getState();
    state.assetsById.set(record.remoteAssetId, record);
    state.hashIndex.set(hashKey(record.userId, record.contentHash), record.remoteAssetId);
    return;
  }

  await resources.pool.query(
    `
      INSERT INTO asset_metadata (
        asset_id,
        user_id,
        content_hash,
        source,
        origin,
        object_key,
        thumbnail_key,
        metadata,
        tags,
        name,
        type,
        size,
        created_at,
        updated_at,
        deleted_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11, $12, $13::timestamptz, $14::timestamptz, $15::timestamptz
      )
      ON CONFLICT (user_id, content_hash)
      DO UPDATE SET
        source = EXCLUDED.source,
        origin = EXCLUDED.origin,
        object_key = EXCLUDED.object_key,
        thumbnail_key = EXCLUDED.thumbnail_key,
        metadata = EXCLUDED.metadata,
        tags = EXCLUDED.tags,
        name = EXCLUDED.name,
        type = EXCLUDED.type,
        size = EXCLUDED.size,
        created_at = EXCLUDED.created_at,
        updated_at = EXCLUDED.updated_at,
        deleted_at = EXCLUDED.deleted_at;
    `,
    [
      record.remoteAssetId,
      record.userId,
      record.contentHash,
      record.source,
      record.origin,
      record.objectKey,
      record.thumbnailKey ?? null,
      JSON.stringify(record.metadata ?? {}),
      JSON.stringify(record.tags ?? []),
      record.name,
      record.type,
      record.size,
      record.createdAt,
      record.updatedAt,
      record.deletedAt ?? null,
    ]
  );
};

const deleteObjectBinary = async (resources: PostgresS3Resources, objectKey?: string) => {
  if (!objectKey) {
    return;
  }
  const { DeleteObjectCommand } = resources.commands;
  await resources.s3Client.send(
    new DeleteObjectCommand({
      Bucket: resources.bucket,
      Key: objectKey,
    })
  );
};

export const deleteAssetRecord = async (
  userId: string,
  remoteAssetId: string
): Promise<ServerAssetRecord | null> => {
  const resources = await getPostgresS3Resources();
  if (!resources) {
    const state = getState();
    const current = state.assetsById.get(remoteAssetId);
    if (!current || current.userId !== userId) {
      return null;
    }
    const deleted: ServerAssetRecord = {
      ...current,
      deletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    state.assetsById.set(remoteAssetId, deleted);
    state.objectBlobs.delete(current.objectKey);
    if (current.thumbnailKey) {
      state.objectBlobs.delete(current.thumbnailKey);
    }
    return deleted;
  }

  const existingResult = await resources.pool.query(
    `
      SELECT *
      FROM asset_metadata
      WHERE user_id = $1
        AND asset_id = $2
      LIMIT 1;
    `,
    [userId, remoteAssetId]
  );

  const existingRow = existingResult.rows[0];
  if (!existingRow) {
    return null;
  }

  const existing = toServerAssetRecord(existingRow);
  const now = new Date().toISOString();

  await resources.pool.query(
    `
      UPDATE asset_metadata
      SET deleted_at = $3::timestamptz,
          updated_at = $4::timestamptz
      WHERE user_id = $1
        AND asset_id = $2;
    `,
    [userId, remoteAssetId, now, now]
  );

  await Promise.allSettled([
    deleteObjectBinary(resources, existing.objectKey),
    deleteObjectBinary(resources, existing.thumbnailKey),
  ]);

  return {
    ...existing,
    deletedAt: now,
    updatedAt: now,
  };
};

export const listAssetChanges = async (
  userId: string,
  since?: string
): Promise<ServerAssetRecord[]> => {
  const resources = await getPostgresS3Resources();
  if (!resources) {
    const threshold = since ? Date.parse(since) : Number.NEGATIVE_INFINITY;
    return Array.from(getState().assetsById.values())
      .filter((record) => record.userId === userId)
      .filter((record) => Date.parse(record.updatedAt) > threshold)
      .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  }

  const result = await resources.pool.query(
    `
      SELECT *
      FROM asset_metadata
      WHERE user_id = $1
        AND updated_at > COALESCE($2::timestamptz, to_timestamp(0))
      ORDER BY updated_at ASC;
    `,
    [userId, since ?? null]
  );

  return result.rows.map((row) => toServerAssetRecord(row));
};
