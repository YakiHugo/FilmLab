import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type {
  AssetAiRecommendation,
  AssetMetadata,
  EditingAdjustments,
  FilmProfile,
  FilmProfileOverrides,
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
}

const DB_NAME = "filmlab-mvp";
const DB_VERSION = 2;

let dbFailed = false;
let dbInstance: IDBPDatabase<FilmLabDB> | null = null;
let dbInitPromise: Promise<IDBPDatabase<FilmLabDB> | null> | null = null;

const MAX_DB_RETRIES = 2;
const DB_RETRY_DELAY_MS = 500;

const initDB = async (): Promise<IDBPDatabase<FilmLabDB> | null> => {
  for (let attempt = 0; attempt <= MAX_DB_RETRIES; attempt++) {
    try {
      const db = await openDB<FilmLabDB>(DB_NAME, DB_VERSION, {
        upgrade(db) {
          if (!db.objectStoreNames.contains("assets")) {
            db.createObjectStore("assets", { keyPath: "id" });
          }
          if (!db.objectStoreNames.contains("project")) {
            db.createObjectStore("project", { keyPath: "id" });
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
    await db.put("assets", asset);
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
    return await db.getAll("assets");
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
    await db.delete("assets", id);
    return true;
  } catch (error) {
    console.warn("IndexedDB deleteAsset failed:", error);
    return false;
  }
}
