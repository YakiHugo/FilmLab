import { openDB, type DBSchema } from "idb";
import type {
  AssetMetadata,
  EditingAdjustments,
  FilmProfile,
  FilmProfileOverrides,
  LutAsset,
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
      seedSalt?: number;
      group?: string;
      thumbnailBlob?: Blob;
      metadata?: AssetMetadata;
      adjustments?: EditingAdjustments;
      filmProfile?: FilmProfile;
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
  lutAssets: {
    key: string;
    value: LutAsset;
  };
}

const DB_NAME = "filmlab-mvp";
const DB_VERSION = 2;

const createDbPromise = () => {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is not available in this environment."));
  }
  return openDB<FilmLabDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("assets")) {
        db.createObjectStore("assets", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("project")) {
        db.createObjectStore("project", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("lutAssets")) {
        db.createObjectStore("lutAssets", { keyPath: "id" });
      }
    },
  });
};

export const dbPromise = createDbPromise();

export async function saveProject(project: FilmLabDB["project"]["value"]) {
  const db = await dbPromise;
  await db.put("project", project);
}

export async function loadProject() {
  const db = await dbPromise;
  const projects = await db.getAll("project");
  return projects[0] ?? null;
}

export async function saveAsset(asset: FilmLabDB["assets"]["value"]) {
  const db = await dbPromise;
  await db.put("assets", asset);
}

export type StoredAsset = FilmLabDB["assets"]["value"];

export async function loadAssets() {
  const db = await dbPromise;
  return db.getAll("assets");
}

export async function clearAssets() {
  const db = await dbPromise;
  await db.clear("assets");
}

export async function saveLutAsset(asset: FilmLabDB["lutAssets"]["value"]) {
  const db = await dbPromise;
  await db.put("lutAssets", asset);
}

export async function loadLutAssets() {
  const db = await dbPromise;
  return db.getAll("lutAssets");
}

export async function getLutAsset(id: string) {
  const db = await dbPromise;
  return db.get("lutAssets", id);
}
