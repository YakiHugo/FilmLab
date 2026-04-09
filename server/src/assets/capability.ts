import { createHmac, timingSafeEqual } from "node:crypto";
import type { AssetFileKind } from "./types";

const DEFAULT_TOKEN_TTL_SECONDS = 24 * 60 * 60; // 24 hours

const toBase64Url = (value: Buffer | string) =>
  Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const fromBase64Url = (value: string) =>
  Buffer.from(
    value
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(value.length / 4) * 4, "="),
    "base64"
  );

const sign = (secret: string, userId: string, assetId: string, kind: AssetFileKind, issuedAt: number) =>
  createHmac("sha256", secret).update(`${userId}:${assetId}:${kind}:${issuedAt}`).digest();

export const createAssetCapabilityToken = (input: {
  secret: string;
  userId: string;
  assetId: string;
  kind: AssetFileKind;
  ttlSeconds?: number;
}) => {
  const issuedAt = Math.floor(Date.now() / 1000);
  const signature = toBase64Url(sign(input.secret, input.userId, input.assetId, input.kind, issuedAt));
  return toBase64Url(`${input.userId}:${issuedAt}:${signature}`);
};

export const verifyAssetCapabilityToken = (input: {
  secret: string;
  token: string;
  assetId: string;
  kind: AssetFileKind;
  ttlSeconds?: number;
}) => {
  try {
    const decoded = fromBase64Url(input.token).toString("utf8");
    const firstColon = decoded.indexOf(":");
    if (firstColon <= 0) {
      return null;
    }

    const userId = decoded.slice(0, firstColon).trim();
    const rest = decoded.slice(firstColon + 1);
    const secondColon = rest.indexOf(":");
    if (secondColon <= 0) {
      return null;
    }

    const issuedAt = Number(rest.slice(0, secondColon));
    if (!Number.isFinite(issuedAt) || issuedAt <= 0) {
      return null;
    }

    const ttl = input.ttlSeconds ?? DEFAULT_TOKEN_TTL_SECONDS;
    const now = Math.floor(Date.now() / 1000);
    if (now - issuedAt > ttl) {
      return null;
    }

    const signature = fromBase64Url(rest.slice(secondColon + 1).trim());
    const expected = sign(input.secret, userId, input.assetId, input.kind, issuedAt);
    if (signature.length !== expected.length) {
      return null;
    }
    return timingSafeEqual(signature, expected) ? userId : null;
  } catch {
    return null;
  }
};
