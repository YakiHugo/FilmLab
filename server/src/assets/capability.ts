import { createHmac, timingSafeEqual } from "node:crypto";
import type { AssetFileKind } from "./types";

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

const sign = (secret: string, userId: string, assetId: string, kind: AssetFileKind) =>
  createHmac("sha256", secret).update(`${userId}:${assetId}:${kind}`).digest();

export const createAssetCapabilityToken = (input: {
  secret: string;
  userId: string;
  assetId: string;
  kind: AssetFileKind;
}) =>
  toBase64Url(
    `${input.userId}:${toBase64Url(sign(input.secret, input.userId, input.assetId, input.kind))}`
  );

export const verifyAssetCapabilityToken = (input: {
  secret: string;
  token: string;
  assetId: string;
  kind: AssetFileKind;
}) => {
  try {
    const decoded = fromBase64Url(input.token).toString("utf8");
    const separatorIndex = decoded.indexOf(":");
    if (separatorIndex <= 0) {
      return null;
    }

    const userId = decoded.slice(0, separatorIndex).trim();
    const signature = fromBase64Url(decoded.slice(separatorIndex + 1).trim());
    const expected = sign(input.secret, userId, input.assetId, input.kind);
    if (signature.length !== expected.length) {
      return null;
    }
    return timingSafeEqual(signature, expected) ? userId : null;
  } catch {
    return null;
  }
};
