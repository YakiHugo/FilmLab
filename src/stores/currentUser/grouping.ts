import type { Asset } from "@/types";

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export const toLocalDayKey = (input?: Date | string): string => {
  const candidate = input instanceof Date ? input : input ? new Date(input) : new Date();
  const date = Number.isNaN(candidate.getTime()) ? new Date() : candidate;
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const resolveLegacyGroupDay = (value: unknown): string | null =>
  typeof value === "string" && DATE_KEY_RE.test(value) ? value : null;

export const resolveAssetImportDay = (
  asset: Pick<Asset, "importDay" | "createdAt"> & { ["group"]?: unknown }
) => {
  if (asset.importDay && DATE_KEY_RE.test(asset.importDay)) {
    return asset.importDay;
  }
  const legacyGroupDay = resolveLegacyGroupDay(asset["group"]);
  if (legacyGroupDay) {
    return legacyGroupDay;
  }
  return toLocalDayKey(asset.createdAt);
};
