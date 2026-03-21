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

export const resolveAssetImportDay = (asset: Pick<Asset, "importDay" | "createdAt" | "group">) => {
  if (asset.importDay && DATE_KEY_RE.test(asset.importDay)) {
    return asset.importDay;
  }
  if (asset.group && DATE_KEY_RE.test(asset.group)) {
    return asset.group;
  }
  return toLocalDayKey(asset.createdAt);
};


