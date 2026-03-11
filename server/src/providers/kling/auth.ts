import { createHmac } from "node:crypto";
import { ProviderError } from "../base/errors";
import type { RuntimeProviderCredentials } from "../base/types";

const TOKEN_TTL_SECONDS = 30 * 60;
const TOKEN_NOT_BEFORE_SKEW_SECONDS = 5;

const encodeBase64Url = (value: string) => Buffer.from(value, "utf8").toString("base64url");

export const generateKlingAuthToken = (
  accessKey: string,
  secretKey: string,
  now = Date.now()
) => {
  const issuedAt = Math.floor(now / 1000);
  const header = {
    alg: "HS256",
    typ: "JWT",
  };
  const payload = {
    iss: accessKey,
    exp: issuedAt + TOKEN_TTL_SECONDS,
    nbf: issuedAt - TOKEN_NOT_BEFORE_SKEW_SECONDS,
  };

  const signingInput = `${encodeBase64Url(JSON.stringify(header))}.${encodeBase64Url(
    JSON.stringify(payload)
  )}`;
  const signature = createHmac("sha256", secretKey)
    .update(signingInput)
    .digest("base64url");

  return `${signingInput}.${signature}`;
};

export const resolveKlingBearerToken = (
  credentials: RuntimeProviderCredentials,
  now = Date.now()
) => {
  const legacyApiKey = credentials.apiKey?.trim();
  if (legacyApiKey) {
    return legacyApiKey;
  }

  const accessKey = credentials.accessKey?.trim() ?? "";
  const secretKey = credentials.secretKey?.trim() ?? "";
  if (!accessKey || !secretKey) {
    throw new ProviderError("Kling access key and secret key are required.", 401);
  }

  return generateKlingAuthToken(accessKey, secretKey, now);
};
