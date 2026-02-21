import type { AssetMetadata } from "@/types";

const pad2 = (value: number) => `${value}`.padStart(2, "0");

const formatTimestamp = (date: Date) => {
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  const hour = pad2(date.getHours());
  const minute = pad2(date.getMinutes());
  return `${year}.${month}.${day} ${hour}:${minute}`;
};

const parseDate = (value: string | undefined) => {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
};

export const resolveAssetTimestampText = (
  metadata?: AssetMetadata,
  createdAt?: string
) => {
  const captured = parseDate(metadata?.capturedAt);
  if (captured) {
    return formatTimestamp(captured);
  }
  const created = parseDate(createdAt);
  if (created) {
    return formatTimestamp(created);
  }
  return null;
};

