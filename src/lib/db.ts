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

const initDB = async (): Promise<IDBPDatabase<FilmLabDB> | null> => {
  try {
    return await openDB<FilmLabDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("assets")) {
          db.createObjectStore("assets", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("project")) {
          db.createObjectStore("project", { keyPath: "id" });
        }
      },
    });
  } catch (error) {
    dbFailed = true;
    console.warn(
      "IndexedDB unavailable (private browsing or quota exceeded). Running in memory-only mode.",
      error
    );
    return null;
  }
};

const dbPromise = initDB();

/** Returns true if IndexedDB failed to open and we're in memory-only mode. */
export const isStorageDegraded = () => dbFailed;

export async function saveProject(project: FilmLabDB["project"]["value"]) {
  const db = await dbPromise;
  if (!db) return;
  await db.put("project", project);
}

export async function loadProject() {
  const db = await dbPromise;
  if (!db) return null;
  const projects = await db.getAll("project");
  return projects[0] ?? null;
}

export async function saveAsset(asset: FilmLabDB["assets"]["value"]) {
  const db = await dbPromise;
  if (!db) return;
  await db.put("assets", asset);
}

export type StoredAsset = FilmLabDB["assets"]["value"];

export async function loadAssets() {
  const db = await dbPromise;
  if (!db) return [];
  return db.getAll("assets");
}

export async function clearAssets() {
  const db = await dbPromise;
  if (!db) return;
  await db.clear("assets");
}
