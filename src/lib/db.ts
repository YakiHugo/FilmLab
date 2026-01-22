import { openDB, type DBSchema } from "idb";
import type { EditingAdjustments } from "@/types";

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
      group?: string;
      adjustments?: EditingAdjustments;
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
const DB_VERSION = 1;

export const dbPromise = openDB<FilmLabDB>(DB_NAME, DB_VERSION, {
  upgrade(db) {
    if (!db.objectStoreNames.contains("assets")) {
      db.createObjectStore("assets", { keyPath: "id" });
    }
    if (!db.objectStoreNames.contains("project")) {
      db.createObjectStore("project", { keyPath: "id" });
    }
  },
});

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

export async function loadAssets() {
  const db = await dbPromise;
  return db.getAll("assets");
}

export async function clearAssets() {
  const db = await dbPromise;
  await db.clear("assets");
}
