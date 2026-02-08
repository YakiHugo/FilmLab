import { getLutAsset, loadLutAssets, saveLutAsset } from "@/lib/db";
import { hashString } from "@/lib/film/utils";
import type { LutAsset } from "@/types";
import { parseCubeLutFile } from "./cube";

const createIdentityLut = (size: number): Float32Array => {
  const values = new Float32Array(size * size * size * 3);
  let pointer = 0;
  const denominator = Math.max(1, size - 1);
  for (let b = 0; b < size; b += 1) {
    for (let g = 0; g < size; g += 1) {
      for (let r = 0; r < size; r += 1) {
        values[pointer] = r / denominator;
        values[pointer + 1] = g / denominator;
        values[pointer + 2] = b / denominator;
        pointer += 3;
      }
    }
  }
  return values;
};

const BUILT_IN_LUTS: LutAsset[] = [
  {
    id: `lut-${hashString("builtin:identity-16").toString(16)}`,
    name: "Identity 16",
    format: "cube",
    size: 16,
    data: createIdentityLut(16),
    source: "builtIn",
    createdAt: "2026-02-08T00:00:00.000Z",
  },
];

const lutCache = new Map<string, LutAsset>();
let initialized = false;
let loading: Promise<void> | null = null;

const upsertCache = (asset: LutAsset) => {
  lutCache.set(asset.id, asset);
};

export const initializeLutRegistry = async () => {
  if (initialized) {
    return;
  }
  if (!loading) {
    loading = (async () => {
      BUILT_IN_LUTS.forEach((asset) => upsertCache(asset));
      const imported = await loadLutAssets();
      imported.forEach((asset) => upsertCache(asset));
      initialized = true;
      loading = null;
    })();
  }
  await loading;
};

export const listLutAssets = async () => {
  await initializeLutRegistry();
  return Array.from(lutCache.values()).map((asset) => ({
    ...asset,
    data: asset.data,
  }));
};

export const resolveLutAsset = async (assetId: string | undefined) => {
  if (!assetId) {
    return null;
  }
  await initializeLutRegistry();
  const cached = lutCache.get(assetId);
  if (cached) {
    return cached;
  }
  const loaded = await getLutAsset(assetId);
  if (loaded) {
    upsertCache(loaded);
    return loaded;
  }
  return null;
};

export const importCubeLut = async (file: File) => {
  const parsed = await parseCubeLutFile(file);
  await saveLutAsset(parsed);
  upsertCache(parsed);
  return parsed;
};

