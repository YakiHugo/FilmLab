import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type {
  AssetAiRecommendation,
  AssetMetadata,
  EditingAdjustments,
  FilmProfile,
  FilmProfileOverrides,
  LocalBrushPoint,
} from "@/types";

export interface ChatSessionRecord {
  id: string;
  assetId: string;
  messages: Array<{ role: string; content: unknown }>;
  model: string;
  provider: string;
  updatedAt: string;
}

interface FilmLabDB extends DBSchema {
  assets: {
    key: string;
    value: {
      id: string;
      name: string;
      type: string;
      size: number;
      createdAt: string;
      blob: Blob;
      presetId?: string;
      intensity?: number;
      filmProfileId?: string;
      filmOverrides?: FilmProfileOverrides;
      group?: string;
      thumbnailBlob?: Blob;
      metadata?: AssetMetadata;
      adjustments?: EditingAdjustments;
      filmProfile?: FilmProfile;
      aiRecommendation?: AssetAiRecommendation;
    };
  };
  project: {
    key: string;
    value: {
      id: string;
      name: string;
      createdAt: string;
      updatedAt: string;
    };
  };
  localMaskBlobs: {
    key: string;
    value: {
      id: string;
      assetId: string;
      blob: Blob;
      updatedAt: string;
    };
    indexes: {
      byAssetId: string;
    };
  };
  chatSessions: {
    key: string;
    value: ChatSessionRecord;
    indexes: {
      byAssetId: string;
    };
  };
}

const DB_NAME = "filmlab-mvp";
const DB_VERSION = 4;

let dbFailed = false;
let dbInstance: IDBPDatabase<FilmLabDB> | null = null;
let dbInitPromise: Promise<IDBPDatabase<FilmLabDB> | null> | null = null;

const MAX_DB_RETRIES = 2;
const DB_RETRY_DELAY_MS = 500;

const initDB = async (): Promise<IDBPDatabase<FilmLabDB> | null> => {
  for (let attempt = 0; attempt <= MAX_DB_RETRIES; attempt++) {
    try {
      const db = await openDB<FilmLabDB>(DB_NAME, DB_VERSION, {
        upgrade(db, oldVersion) {
          if (!db.objectStoreNames.contains("assets")) {
            db.createObjectStore("assets", { keyPath: "id" });
          }
          if (!db.objectStoreNames.contains("project")) {
            db.createObjectStore("project", { keyPath: "id" });
          }
          if (oldVersion < 3 && !db.objectStoreNames.contains("localMaskBlobs")) {
            const store = db.createObjectStore("localMaskBlobs", { keyPath: "id" });
            store.createIndex("byAssetId", "assetId", { unique: false });
          }
          if (oldVersion < 4 && !db.objectStoreNames.contains("chatSessions")) {
            const chatStore = db.createObjectStore("chatSessions", { keyPath: "id" });
            chatStore.createIndex("byAssetId", "assetId", { unique: false });
          }
        },
        blocked() {
          console.warn("IndexedDB upgrade blocked — another tab has an older version open.");
        },
        blocking() {
          // Another tab is trying to upgrade; close our connection so it can proceed.
          dbInstance?.close();
          dbInstance = null;
          dbInitPromise = null;
        },
        terminated() {
          // Browser forcibly closed the connection (e.g. memory pressure, crash recovery).
          console.warn("IndexedDB connection terminated by browser.");
          dbInstance = null;
          dbInitPromise = null;
        },
      });
      dbFailed = false;
      dbInstance = db;
      return db;
    } catch (error) {
      if (attempt < MAX_DB_RETRIES) {
        await new Promise((r) => setTimeout(r, DB_RETRY_DELAY_MS));
        continue;
      }
      dbFailed = true;
      console.warn(
        "IndexedDB unavailable (private browsing or quota exceeded). Running in memory-only mode.",
        error
      );
      return null;
    }
  }
  return null;
};

const getDB = (): Promise<IDBPDatabase<FilmLabDB> | null> => {
  if (dbInstance) return Promise.resolve(dbInstance);
  if (!dbInitPromise) {
    dbInitPromise = initDB().finally(() => {
      // Allow re-init on next call if it failed
      if (dbFailed) dbInitPromise = null;
    });
  }
  return dbInitPromise;
};

/** Returns true if IndexedDB failed to open and we're in memory-only mode. */
export const isStorageDegraded = () => dbFailed;

const BRUSH_MASK_BLOB_POINT_THRESHOLD = 256;

const clampValue = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const normalizeBrushPoints = (points: LocalBrushPoint[]) =>
  points.map((point) => ({
    x: clampValue(Number(point.x) || 0, 0, 1),
    y: clampValue(Number(point.y) || 0, 0, 1),
    pressure: clampValue(Number(point.pressure ?? 1) || 1, 0.05, 1),
  }));

const parseBrushPointsFromBlob = async (blob: Blob): Promise<LocalBrushPoint[] | null> => {
  try {
    const raw = JSON.parse(await blob.text()) as {
      version?: number;
      points?: Array<{ x?: unknown; y?: unknown; pressure?: unknown }>;
    };
    if (raw.version !== 1 || !Array.isArray(raw.points)) {
      return null;
    }
    const nextPoints: LocalBrushPoint[] = [];
    for (const point of raw.points) {
      if (!point || typeof point !== "object") {
        continue;
      }
      const x = Number(point.x);
      const y = Number(point.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        continue;
      }
      const pressure = Number(point.pressure ?? 1);
      nextPoints.push({
        x: clampValue(x, 0, 1),
        y: clampValue(y, 0, 1),
        pressure: clampValue(Number.isFinite(pressure) ? pressure : 1, 0.05, 1),
      });
    }
    return nextPoints;
  } catch {
    return null;
  }
};

const deleteMaskBlobsByAssetId = async (db: IDBPDatabase<FilmLabDB>, assetId: string) => {
  if (!db.objectStoreNames.contains("localMaskBlobs")) {
    return;
  }
  const tx = db.transaction("localMaskBlobs", "readwrite");
  const byAssetId = tx.store.index("byAssetId");
  let cursor = await byAssetId.openCursor(IDBKeyRange.only(assetId));
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
};

const maybeOffloadBrushMaskBlobs = async (
  db: IDBPDatabase<FilmLabDB>,
  assetId: string,
  adjustments: EditingAdjustments | undefined
): Promise<EditingAdjustments | undefined> => {
  if (
    !adjustments?.localAdjustments ||
    adjustments.localAdjustments.length === 0 ||
    !db.objectStoreNames.contains("localMaskBlobs")
  ) {
    return adjustments;
  }

  const tx = db.transaction("localMaskBlobs", "readwrite");
  const nextLocals = await Promise.all(
    adjustments.localAdjustments.map(async (local, index) => {
      if (local.mask.mode !== "brush") {
        return local;
      }
      const points = normalizeBrushPoints(local.mask.points ?? []);
      if (points.length < BRUSH_MASK_BLOB_POINT_THRESHOLD) {
        if (!local.mask.pointsBlobId) {
          return local;
        }
        return {
          ...local,
          mask: {
            ...local.mask,
            points,
            pointsBlobId: undefined,
          },
        };
      }

      const blobId = `asset:${assetId}:local:${local.id || index}:brush:v1`;
      const payload = JSON.stringify({
        version: 1,
        points,
      });
      await tx.store.put({
        id: blobId,
        assetId,
        blob: new Blob([payload], { type: "application/json" }),
        updatedAt: new Date().toISOString(),
      });
      return {
        ...local,
        mask: {
          ...local.mask,
          points: [],
          pointsBlobId: blobId,
        },
      };
    })
  );
  await tx.done;

  return {
    ...adjustments,
    localAdjustments: nextLocals,
  };
};

const hydrateBrushMaskBlobs = async (
  db: IDBPDatabase<FilmLabDB>,
  adjustments: EditingAdjustments | undefined
): Promise<EditingAdjustments | undefined> => {
  if (
    !adjustments?.localAdjustments ||
    adjustments.localAdjustments.length === 0 ||
    !db.objectStoreNames.contains("localMaskBlobs")
  ) {
    return adjustments;
  }

  let changed = false;
  const nextLocals = await Promise.all(
    adjustments.localAdjustments.map(async (local) => {
      if (
        local.mask.mode !== "brush" ||
        !local.mask.pointsBlobId ||
        (local.mask.points?.length ?? 0) > 0
      ) {
        return local;
      }
      const blobRecord = await db.get("localMaskBlobs", local.mask.pointsBlobId);
      if (!blobRecord?.blob) {
        return local;
      }
      const points = await parseBrushPointsFromBlob(blobRecord.blob);
      if (!points || points.length === 0) {
        return local;
      }
      changed = true;
      return {
        ...local,
        mask: {
          ...local.mask,
          points,
        },
      };
    })
  );

  if (!changed) {
    return adjustments;
  }

  return {
    ...adjustments,
    localAdjustments: nextLocals,
  };
};

export async function saveProject(project: FilmLabDB["project"]["value"]): Promise<boolean> {
  const db = await getDB();
  if (!db) return false;
  try {
    await db.put("project", project);
    return true;
  } catch (error) {
    console.warn("IndexedDB saveProject failed:", error);
    return false;
  }
}

export async function loadProject(id = "default") {
  const db = await getDB();
  if (!db) return null;
  try {
    return (await db.get("project", id)) ?? null;
  } catch (error) {
    console.warn("IndexedDB loadProject failed:", error);
    return null;
  }
}

export async function saveAsset(asset: FilmLabDB["assets"]["value"]): Promise<boolean> {
  const db = await getDB();
  if (!db) return false;
  try {
    await deleteMaskBlobsByAssetId(db, asset.id);
    const storedAdjustments = await maybeOffloadBrushMaskBlobs(db, asset.id, asset.adjustments);
    await db.put("assets", {
      ...asset,
      adjustments: storedAdjustments,
    });
    return true;
  } catch (error) {
    console.warn("IndexedDB saveAsset failed:", error);
    return false;
  }
}

export type StoredAsset = FilmLabDB["assets"]["value"];

export async function loadAssets() {
  const db = await getDB();
  if (!db) return [];
  try {
    const assets = await db.getAll("assets");
    return Promise.all(
      assets.map(async (asset) => ({
        ...asset,
        adjustments: await hydrateBrushMaskBlobs(db, asset.adjustments),
      }))
    );
  } catch (error) {
    console.warn("IndexedDB loadAssets failed:", error);
    return [];
  }
}

export async function clearAssets(): Promise<boolean> {
  const db = await getDB();
  if (!db) return false;
  try {
    await db.clear("assets");
    if (db.objectStoreNames.contains("localMaskBlobs")) {
      await db.clear("localMaskBlobs");
    }
    return true;
  } catch (error) {
    console.warn("IndexedDB clearAssets failed:", error);
    return false;
  }
}

export async function deleteAsset(id: string): Promise<boolean> {
  const db = await getDB();
  if (!db) return false;
  try {
    await deleteMaskBlobsByAssetId(db, id);
    await db.delete("assets", id);
    // Clean up associated chat sessions
    await deleteChatSessionsByAssetId(id);
    return true;
  } catch (error) {
    console.warn("IndexedDB deleteAsset failed:", error);
    return false;
  }
}

// ── Chat session persistence ──────────────────────────────────────────

export async function saveChatSession(session: ChatSessionRecord): Promise<boolean> {
  const db = await getDB();
  if (!db || !db.objectStoreNames.contains("chatSessions")) return false;
  try {
    await db.put("chatSessions", session);
    return true;
  } catch (error) {
    console.warn("IndexedDB saveChatSession failed:", error);
    return false;
  }
}

export async function loadChatSession(id: string): Promise<ChatSessionRecord | null> {
  const db = await getDB();
  if (!db || !db.objectStoreNames.contains("chatSessions")) return null;
  try {
    return (await db.get("chatSessions", id)) ?? null;
  } catch (error) {
    console.warn("IndexedDB loadChatSession failed:", error);
    return null;
  }
}

export async function loadChatSessionByAssetId(assetId: string): Promise<ChatSessionRecord | null> {
  const db = await getDB();
  if (!db || !db.objectStoreNames.contains("chatSessions")) return null;
  try {
    const all = await db.getAllFromIndex("chatSessions", "byAssetId", assetId);
    if (all.length === 0) return null;
    // Return the most recently updated session
    return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  } catch (error) {
    console.warn("IndexedDB loadChatSessionByAssetId failed:", error);
    return null;
  }
}

export async function deleteChatSession(id: string): Promise<boolean> {
  const db = await getDB();
  if (!db || !db.objectStoreNames.contains("chatSessions")) return false;
  try {
    await db.delete("chatSessions", id);
    return true;
  } catch (error) {
    console.warn("IndexedDB deleteChatSession failed:", error);
    return false;
  }
}

async function deleteChatSessionsByAssetId(assetId: string): Promise<void> {
  const db = await getDB();
  if (!db || !db.objectStoreNames.contains("chatSessions")) return;
  try {
    const tx = db.transaction("chatSessions", "readwrite");
    const index = tx.store.index("byAssetId");
    let cursor = await index.openCursor(IDBKeyRange.only(assetId));
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
    await tx.done;
  } catch (error) {
    console.warn("IndexedDB deleteChatSessionsByAssetId failed:", error);
  }
}
