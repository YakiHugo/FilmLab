import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { getCurrentUserId } from "@/lib/authToken";
import { logDb, logDbError } from "@/lib/db.logger";
import type {
  AssetOrigin,
  AssetOwnerRef,
  AssetMetadata,
  AssetRemoteState,
  AssetSyncJobOperation,
  CanvasWorkbenchListEntry,
  CanvasWorkbenchSnapshot,
} from "@/types";

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
      importDay?: string;
      tags?: string[];
      thumbnailBlob?: Blob;
      metadata?: AssetMetadata;
      source?: "imported" | "ai-generated";
      origin?: AssetOrigin;
      contentHash?: string;
      remote?: AssetRemoteState;
      ownerRef?: AssetOwnerRef;
    };
    indexes: {
      byOwnerUserId: string;
    };
  };
  currentUser: {
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
  canvasWorkbenches: {
    key: string;
    value: CanvasWorkbenchSnapshot;
    indexes: {
      byOwnerUserId: string;
    };
  };
  canvasWorkbenchListEntries: {
    key: string;
    value: CanvasWorkbenchListEntry & {
      ownerRef: {
        userId: string;
      };
    };
    indexes: {
      byOwnerUserId: string;
    };
  };
  assetSyncJobs: {
    key: string;
    value: {
      jobId: string;
      localAssetId: string;
      ownerUserId?: string;
      op: AssetSyncJobOperation;
      attempts: number;
      nextRetryAt: string;
      lastError?: string;
      createdAt: string;
      updatedAt: string;
    };
    indexes: {
      byLocalAssetId: string;
      byNextRetryAt: string;
      byOwnerUserId: string;
      byOp: AssetSyncJobOperation;
    };
  };
}

const DB_NAME = "filmlab-mvp";
const DB_VERSION = 14;

let dbFailed = false;
let dbInstance: IDBPDatabase<FilmLabDB> | null = null;
let dbInitPromise: Promise<IDBPDatabase<FilmLabDB> | null> | null = null;

const MAX_DB_RETRIES = 2;
const DB_RETRY_DELAY_MS = 500;

const initDB = async (): Promise<IDBPDatabase<FilmLabDB> | null> => {
  for (let attempt = 0; attempt <= MAX_DB_RETRIES; attempt++) {
    try {
      const db = await openDB<FilmLabDB>(DB_NAME, DB_VERSION, {
        upgrade(db, oldVersion, _newVersion, transaction) {
          const existingStoreNames = db.objectStoreNames as unknown as DOMStringList;
          const schemaDb = db as unknown as { deleteObjectStore: (name: string) => void };
          const deleteStoreIfPresent = (storeName: string) => {
            if (existingStoreNames.contains(storeName)) {
              schemaDb.deleteObjectStore(storeName);
            }
          };

          if (oldVersion < 11) {
            [
              "project",
              "canvasDocuments",
              "assets",
              "localMaskBlobs",
              "assetSyncJobs",
              "canvasWorkbenches",
              "canvasWorkbenchListEntries",
            ].forEach(deleteStoreIfPresent);
          }

          if (!db.objectStoreNames.contains("assets")) {
            const store = db.createObjectStore("assets", { keyPath: "id" });
            store.createIndex("byOwnerUserId", "ownerRef.userId", { unique: false });
          } else {
            const store = transaction.objectStore("assets");
            if (!store.indexNames.contains("byOwnerUserId")) {
              store.createIndex("byOwnerUserId", "ownerRef.userId", { unique: false });
            }
          }
          if (!db.objectStoreNames.contains("currentUser")) {
            db.createObjectStore("currentUser", { keyPath: "id" });
          }
          if (!db.objectStoreNames.contains("localMaskBlobs")) {
            const store = db.createObjectStore("localMaskBlobs", { keyPath: "id" });
            store.createIndex("byAssetId", "assetId", { unique: false });
          } else {
            const store = transaction.objectStore("localMaskBlobs");
            if (!store.indexNames.contains("byAssetId")) {
              store.createIndex("byAssetId", "assetId", { unique: false });
            }
          }

          if (oldVersion < 14) {
            deleteStoreIfPresent("canvasWorkbenchListEntries");
            deleteStoreIfPresent("canvasWorkbenches");
          }

          if (!db.objectStoreNames.contains("canvasWorkbenches")) {
            const store = db.createObjectStore("canvasWorkbenches", { keyPath: "id" });
            store.createIndex("byOwnerUserId", "ownerRef.userId", { unique: false });
          } else {
            const store = transaction.objectStore("canvasWorkbenches");
            if (!store.indexNames.contains("byOwnerUserId")) {
              store.createIndex("byOwnerUserId", "ownerRef.userId", { unique: false });
            }
          }
          if (!db.objectStoreNames.contains("canvasWorkbenchListEntries")) {
            const store = db.createObjectStore("canvasWorkbenchListEntries", { keyPath: "id" });
            store.createIndex("byOwnerUserId", "ownerRef.userId", { unique: false });
          } else {
            const store = transaction.objectStore("canvasWorkbenchListEntries");
            if (!store.indexNames.contains("byOwnerUserId")) {
              store.createIndex("byOwnerUserId", "ownerRef.userId", { unique: false });
            }
          }
          if (!db.objectStoreNames.contains("assetSyncJobs")) {
            const syncStore = db.createObjectStore("assetSyncJobs", { keyPath: "jobId" });
            syncStore.createIndex("byLocalAssetId", "localAssetId", { unique: false });
            syncStore.createIndex("byNextRetryAt", "nextRetryAt", { unique: false });
            syncStore.createIndex("byOwnerUserId", "ownerUserId", { unique: false });
            syncStore.createIndex("byOp", "op", { unique: false });
          } else if (oldVersion < 12) {
            deleteStoreIfPresent("assetSyncJobs");
            const syncStore = db.createObjectStore("assetSyncJobs", { keyPath: "jobId" });
            syncStore.createIndex("byLocalAssetId", "localAssetId", { unique: false });
            syncStore.createIndex("byNextRetryAt", "nextRetryAt", { unique: false });
            syncStore.createIndex("byOwnerUserId", "ownerUserId", { unique: false });
            syncStore.createIndex("byOp", "op", { unique: false });
          } else {
            const syncStore = transaction.objectStore("assetSyncJobs");
            if (!syncStore.indexNames.contains("byLocalAssetId")) {
              syncStore.createIndex("byLocalAssetId", "localAssetId", { unique: false });
            }
            if (!syncStore.indexNames.contains("byNextRetryAt")) {
              syncStore.createIndex("byNextRetryAt", "nextRetryAt", { unique: false });
            }
            if (!syncStore.indexNames.contains("byOwnerUserId")) {
              syncStore.createIndex("byOwnerUserId", "ownerUserId", { unique: false });
            }
            if (!syncStore.indexNames.contains("byOp")) {
              syncStore.createIndex("byOp", "op", { unique: false });
            }
          }
          // v5+ only add optional value fields (`importDay`, `tags`, `source`, sync fields).
          // No value migration is needed because IndexedDB values are schemaless.
        },
        blocked() {
          logDb({
            op: "migrate",
            phase: "error",
            caller: "blocked",
            error: { message: "upgrade blocked by another tab with an older schema" },
          });
        },
        blocking() {
          // Another tab is trying to upgrade; close our connection so it can proceed.
          dbInstance?.close();
          dbInstance = null;
          dbInitPromise = null;
        },
        terminated() {
          // Browser forcibly closed the connection (e.g. memory pressure, crash recovery).
          logDb({
            op: "openDb",
            phase: "error",
            caller: "terminated",
            error: { message: "IndexedDB connection terminated by browser" },
          });
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
      logDbError({ op: "openDb", caller: "initDB" }, error);
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

const deleteSyncJobsByAssetId = async (db: IDBPDatabase<FilmLabDB>, assetId: string) => {
  if (!db.objectStoreNames.contains("assetSyncJobs")) {
    return;
  }
  const tx = db.transaction("assetSyncJobs", "readwrite");
  const byLocalAssetId = tx.store.index("byLocalAssetId");
  let cursor = await byLocalAssetId.openCursor(IDBKeyRange.only(assetId));
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
};

export async function saveCurrentUser(
  currentUser: FilmLabDB["currentUser"]["value"]
): Promise<boolean> {
  const db = await getDB();
  if (!db) return false;
  try {
    await db.put("currentUser", currentUser);
    return true;
  } catch (error) {
    logDbError(
      { op: "put", storeName: "currentUser", key: currentUser.id, caller: "saveCurrentUser" },
      error
    );
    return false;
  }
}

export async function loadCurrentUser(id: string) {
  const db = await getDB();
  if (!db) return null;
  try {
    return (await db.get("currentUser", id)) ?? null;
  } catch (error) {
    logDbError({ op: "get", storeName: "currentUser", key: id, caller: "loadCurrentUser" }, error);
    return null;
  }
}

export async function saveAsset(asset: FilmLabDB["assets"]["value"]): Promise<boolean> {
  const db = await getDB();
  if (!db) return false;
  try {
    await deleteMaskBlobsByAssetId(db, asset.id);
    await db.put("assets", {
      ...asset,
      ownerRef: { userId: getCurrentUserId() },
    });
    return true;
  } catch (error) {
    logDbError({ op: "put", storeName: "assets", key: asset.id, caller: "saveAsset" }, error);
    return false;
  }
}

export type StoredAsset = FilmLabDB["assets"]["value"];

export async function loadAssets() {
  const db = await getDB();
  if (!db) return [];
  try {
    return await db.getAll("assets");
  } catch (error) {
    logDbError({ op: "get", storeName: "assets", caller: "loadAssets" }, error);
    return [];
  }
}

export async function loadAssetsByUser(userId: string): Promise<StoredAsset[]> {
  const db = await getDB();
  if (!db || !db.objectStoreNames.contains("assets")) return [];
  try {
    return await db.getAllFromIndex("assets", "byOwnerUserId", userId);
  } catch (error) {
    logDbError(
      { op: "get", storeName: "assets", key: userId, caller: "loadAssetsByUser" },
      error
    );
    return [];
  }
}

export type StoredAssetSyncJob = FilmLabDB["assetSyncJobs"]["value"];

export async function saveAssetSyncJob(job: StoredAssetSyncJob): Promise<boolean> {
  const db = await getDB();
  if (!db || !db.objectStoreNames.contains("assetSyncJobs")) return false;
  try {
    await db.put("assetSyncJobs", {
      ...job,
      ownerUserId: getCurrentUserId(),
    });
    return true;
  } catch (error) {
    logDbError(
      { op: "put", storeName: "assetSyncJobs", key: job.jobId, caller: "saveAssetSyncJob" },
      error
    );
    return false;
  }
}

export async function saveAssetSyncJobs(jobs: StoredAssetSyncJob[]): Promise<boolean> {
  const db = await getDB();
  if (!db || !db.objectStoreNames.contains("assetSyncJobs")) return false;
  if (jobs.length === 0) return true;
  try {
    const tx = db.transaction("assetSyncJobs", "readwrite");
    for (const job of jobs) {
      await tx.store.put({
        ...job,
        ownerUserId: getCurrentUserId(),
      });
    }
    await tx.done;
    return true;
  } catch (error) {
    logDbError({ op: "put", storeName: "assetSyncJobs", caller: "saveAssetSyncJobs" }, error);
    return false;
  }
}

export async function loadAssetSyncJobs(limit = 128): Promise<StoredAssetSyncJob[]> {
  const db = await getDB();
  if (!db || !db.objectStoreNames.contains("assetSyncJobs")) return [];
  try {
    const jobs = await db.getAll("assetSyncJobs");
    return jobs
      .sort((a, b) => a.nextRetryAt.localeCompare(b.nextRetryAt))
      .slice(0, Math.max(1, limit));
  } catch (error) {
    logDbError({ op: "get", storeName: "assetSyncJobs", caller: "loadAssetSyncJobs" }, error);
    return [];
  }
}

export async function loadAssetSyncJobsByUser(
  userId: string,
  limit = 128
): Promise<StoredAssetSyncJob[]> {
  const db = await getDB();
  if (!db || !db.objectStoreNames.contains("assetSyncJobs")) return [];
  try {
    const jobs = await db.getAllFromIndex("assetSyncJobs", "byOwnerUserId", userId);
    return jobs
      .sort((a, b) => a.nextRetryAt.localeCompare(b.nextRetryAt))
      .slice(0, Math.max(1, limit));
  } catch (error) {
    logDbError(
      { op: "get", storeName: "assetSyncJobs", key: userId, caller: "loadAssetSyncJobsByUser" },
      error
    );
    return [];
  }
}

export async function loadAssetSyncJobsByAssetId(assetId: string): Promise<StoredAssetSyncJob[]> {
  const db = await getDB();
  if (!db || !db.objectStoreNames.contains("assetSyncJobs")) return [];
  try {
    return await db.getAllFromIndex("assetSyncJobs", "byLocalAssetId", assetId);
  } catch (error) {
    logDbError(
      {
        op: "get",
        storeName: "assetSyncJobs",
        key: assetId,
        caller: "loadAssetSyncJobsByAssetId",
      },
      error
    );
    return [];
  }
}

export async function deleteAssetSyncJob(jobId: string): Promise<boolean> {
  const db = await getDB();
  if (!db || !db.objectStoreNames.contains("assetSyncJobs")) return false;
  try {
    await db.delete("assetSyncJobs", jobId);
    return true;
  } catch (error) {
    logDbError(
      { op: "delete", storeName: "assetSyncJobs", key: jobId, caller: "deleteAssetSyncJob" },
      error
    );
    return false;
  }
}

export async function deleteAssetSyncJobsByAssetId(assetId: string): Promise<boolean> {
  const db = await getDB();
  if (!db || !db.objectStoreNames.contains("assetSyncJobs")) return false;
  try {
    await deleteSyncJobsByAssetId(db, assetId);
    return true;
  } catch (error) {
    logDbError(
      {
        op: "delete",
        storeName: "assetSyncJobs",
        key: assetId,
        caller: "deleteAssetSyncJobsByAssetId",
      },
      error
    );
    return false;
  }
}

export async function clearAssetSyncJobsByUser(userId: string): Promise<boolean> {
  const db = await getDB();
  if (!db || !db.objectStoreNames.contains("assetSyncJobs")) return false;
  try {
    const jobs = await db.getAllFromIndex("assetSyncJobs", "byOwnerUserId", userId);
    await Promise.all(jobs.map((job) => db.delete("assetSyncJobs", job.jobId)));
    return true;
  } catch (error) {
    logDbError(
      {
        op: "delete",
        storeName: "assetSyncJobs",
        key: userId,
        caller: "clearAssetSyncJobsByUser",
      },
      error
    );
    return false;
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
    if (db.objectStoreNames.contains("assetSyncJobs")) {
      await db.clear("assetSyncJobs");
    }
    return true;
  } catch (error) {
    logDbError({ op: "delete", storeName: "assets", caller: "clearAssets" }, error);
    return false;
  }
}

export async function clearAssetsByUser(userId: string): Promise<boolean> {
  const db = await getDB();
  if (!db || !db.objectStoreNames.contains("assets")) return false;
  try {
    const assets = await db.getAllFromIndex("assets", "byOwnerUserId", userId);
    const results = await Promise.all(
      assets.map(async (asset) => {
        const [deletedSyncJobs, deletedAsset] = await Promise.all([
          deleteAssetSyncJobsByAssetId(asset.id),
          deleteAsset(asset.id),
        ]);
        return deletedSyncJobs && deletedAsset;
      })
    );
    return results.every(Boolean);
  } catch (error) {
    logDbError(
      { op: "delete", storeName: "assets", key: userId, caller: "clearAssetsByUser" },
      error
    );
    return false;
  }
}

export async function deleteAsset(id: string): Promise<boolean> {
  const db = await getDB();
  if (!db) return false;
  try {
    await deleteMaskBlobsByAssetId(db, id);
    await db.delete("assets", id);
    return true;
  } catch (error) {
    logDbError({ op: "delete", storeName: "assets", key: id, caller: "deleteAsset" }, error);
    return false;
  }
}

export type StoredCanvasWorkbench = FilmLabDB["canvasWorkbenches"]["value"];
export type StoredCanvasWorkbenchListEntry = Omit<
  FilmLabDB["canvasWorkbenchListEntries"]["value"],
  "ownerRef"
>;

const toStoredCanvasWorkbenchListEntry = (
  entry: CanvasWorkbenchListEntry
): FilmLabDB["canvasWorkbenchListEntries"]["value"] => ({
  ...entry,
  ownerRef: { userId: getCurrentUserId() },
});

const fromStoredCanvasWorkbenchListEntry = (
  entry: FilmLabDB["canvasWorkbenchListEntries"]["value"]
): StoredCanvasWorkbenchListEntry => {
  const { ownerRef: _ownerRef, ...listEntry } = entry;
  return listEntry;
};

export async function saveCanvasWorkbenchRecord(
  document: StoredCanvasWorkbench,
  listEntry: CanvasWorkbenchListEntry
): Promise<boolean> {
  const db = await getDB();
  if (
    !db ||
    !db.objectStoreNames.contains("canvasWorkbenches") ||
    !db.objectStoreNames.contains("canvasWorkbenchListEntries")
  ) {
    return false;
  }
  try {
    const tx = db.transaction(
      ["canvasWorkbenches", "canvasWorkbenchListEntries"],
      "readwrite"
    );
    await tx.objectStore("canvasWorkbenches").put({
      ...document,
      ownerRef: document.ownerRef ?? { userId: getCurrentUserId() },
    });
    await tx.objectStore("canvasWorkbenchListEntries").put(
      toStoredCanvasWorkbenchListEntry(listEntry)
    );
    await tx.done;
    return true;
  } catch (error) {
    logDbError(
      {
        op: "put",
        storeName: "canvasWorkbenches",
        key: document.id,
        caller: "saveCanvasWorkbenchRecord",
      },
      error
    );
    return false;
  }
}

export async function loadCanvasWorkbench(id: string): Promise<StoredCanvasWorkbench | null> {
  const db = await getDB();
  if (!db || !db.objectStoreNames.contains("canvasWorkbenches")) return null;
  try {
    return (await db.get("canvasWorkbenches", id)) ?? null;
  } catch (error) {
    logDbError(
      { op: "get", storeName: "canvasWorkbenches", key: id, caller: "loadCanvasWorkbench" },
      error
    );
    return null;
  }
}

export async function loadCanvasWorkbenchListEntries(): Promise<StoredCanvasWorkbenchListEntry[]> {
  const db = await getDB();
  if (!db || !db.objectStoreNames.contains("canvasWorkbenchListEntries")) return [];
  try {
    const entries = await db.getAll("canvasWorkbenchListEntries");
    return entries
      .map(fromStoredCanvasWorkbenchListEntry)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch (error) {
    logDbError(
      {
        op: "get",
        storeName: "canvasWorkbenchListEntries",
        caller: "loadCanvasWorkbenchListEntries",
      },
      error
    );
    return [];
  }
}

export async function loadCanvasWorkbenchListEntriesByUser(
  userId: string
): Promise<StoredCanvasWorkbenchListEntry[]> {
  const db = await getDB();
  if (!db) {
    throw new Error("Canvas workbench database is unavailable.");
  }
  try {
    if (!db.objectStoreNames.contains("canvasWorkbenchListEntries")) {
      throw new Error("Canvas workbench list store is unavailable.");
    }
    const entries = db
      .transaction("canvasWorkbenchListEntries")
      .store.indexNames.contains("byOwnerUserId")
      ? await db.getAllFromIndex("canvasWorkbenchListEntries", "byOwnerUserId", userId)
      : (await db.getAll("canvasWorkbenchListEntries")).filter(
          (entry) => entry.ownerRef?.userId === userId
        );
    return entries
      .map(fromStoredCanvasWorkbenchListEntry)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch (error) {
    logDbError(
      {
        op: "get",
        storeName: "canvasWorkbenchListEntries",
        key: userId,
        caller: "loadCanvasWorkbenchListEntriesByUser",
      },
      error
    );
    throw error;
  }
}

export async function loadCanvasWorkbenchesByUser(userId: string): Promise<StoredCanvasWorkbench[]> {
  const db = await getDB();
  if (!db || !db.objectStoreNames.contains("canvasWorkbenches")) return [];
  try {
    const workbenches = db.transaction("canvasWorkbenches").store.indexNames.contains("byOwnerUserId")
      ? await db.getAllFromIndex("canvasWorkbenches", "byOwnerUserId", userId)
      : (await db.getAll("canvasWorkbenches")).filter(
          (workbench) => workbench.ownerRef?.userId === userId
        );
    return workbenches.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch (error) {
    logDbError(
      {
        op: "get",
        storeName: "canvasWorkbenches",
        key: userId,
        caller: "loadCanvasWorkbenchesByUser",
      },
      error
    );
    return [];
  }
}

export async function deleteCanvasWorkbenchRecord(id: string): Promise<boolean> {
  const db = await getDB();
  if (
    !db ||
    !db.objectStoreNames.contains("canvasWorkbenches") ||
    !db.objectStoreNames.contains("canvasWorkbenchListEntries")
  ) {
    return false;
  }
  try {
    const tx = db.transaction(
      ["canvasWorkbenches", "canvasWorkbenchListEntries"],
      "readwrite"
    );
    await tx.objectStore("canvasWorkbenches").delete(id);
    await tx.objectStore("canvasWorkbenchListEntries").delete(id);
    await tx.done;
    return true;
  } catch (error) {
    logDbError(
      {
        op: "delete",
        storeName: "canvasWorkbenches",
        key: id,
        caller: "deleteCanvasWorkbenchRecord",
      },
      error
    );
    return false;
  }
}

export async function clearCanvasWorkbenches(): Promise<boolean> {
  const db = await getDB();
  if (
    !db ||
    !db.objectStoreNames.contains("canvasWorkbenches") ||
    !db.objectStoreNames.contains("canvasWorkbenchListEntries")
  ) {
    return false;
  }
  try {
    const tx = db.transaction(
      ["canvasWorkbenches", "canvasWorkbenchListEntries"],
      "readwrite"
    );
    await tx.objectStore("canvasWorkbenches").clear();
    await tx.objectStore("canvasWorkbenchListEntries").clear();
    await tx.done;
    return true;
  } catch (error) {
    logDbError(
      { op: "delete", storeName: "canvasWorkbenches", caller: "clearCanvasWorkbenches" },
      error
    );
    return false;
  }
}

export async function clearCanvasWorkbenchesByUser(userId: string): Promise<boolean> {
  const db = await getDB();
  if (
    !db ||
    !db.objectStoreNames.contains("canvasWorkbenches") ||
    !db.objectStoreNames.contains("canvasWorkbenchListEntries")
  ) {
    return false;
  }
  try {
    const workbenches = db.transaction("canvasWorkbenches").store.indexNames.contains("byOwnerUserId")
      ? await db.getAllFromIndex("canvasWorkbenches", "byOwnerUserId", userId)
      : (await db.getAll("canvasWorkbenches")).filter(
          (workbench) => workbench.ownerRef?.userId === userId
        );
    const tx = db.transaction(
      ["canvasWorkbenches", "canvasWorkbenchListEntries"],
      "readwrite"
    );
    for (const workbench of workbenches) {
      await tx.objectStore("canvasWorkbenches").delete(workbench.id);
      await tx.objectStore("canvasWorkbenchListEntries").delete(workbench.id);
    }
    await tx.done;
    return true;
  } catch (error) {
    logDbError(
      {
        op: "delete",
        storeName: "canvasWorkbenches",
        key: userId,
        caller: "clearCanvasWorkbenchesByUser",
      },
      error
    );
    return false;
  }
}
