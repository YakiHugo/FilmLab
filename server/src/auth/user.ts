import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { getConfig } from "../config";

interface JwtHeader {
  alg?: unknown;
  typ?: unknown;
}

interface JwtPayload {
  sub?: unknown;
  exp?: unknown;
  iss?: unknown;
  aud?: unknown;
}

const decodeBase64Url = (value: string) => {
  const padded = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Buffer.from(padded, "base64").toString("utf8");
};

const encodeBase64Url = (value: Buffer | string) =>
  Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const parseJwtPart = <T>(value: string): T | null => {
  try {
    return JSON.parse(decodeBase64Url(value)) as T;
  } catch {
    return null;
  }
};

const hasValidExpiry = (payload: JwtPayload) => {
  if (payload.exp == null) {
    return true;
  }

  if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp)) {
    return false;
  }

  return payload.exp > Math.floor(Date.now() / 1000);
};

const hasExpectedIssuer = (payload: JwtPayload, issuer?: string) =>
  !issuer || payload.iss === issuer;

const hasExpectedAudience = (payload: JwtPayload, audience?: string) => {
  if (!audience) {
    return true;
  }

  if (typeof payload.aud === "string") {
    return payload.aud === audience;
  }

  if (Array.isArray(payload.aud)) {
    return payload.aud.includes(audience);
  }

  return false;
};

const readValidatedSub = (payload: JwtPayload) =>
  typeof payload.sub === "string" && payload.sub.trim() ? payload.sub.trim() : null;

const verifyHs256Signature = (signingInput: string, signature: string, secret: string) => {
  const expectedSignature = encodeBase64Url(
    createHmac("sha256", secret).update(signingInput).digest()
  );

  const expectedBuffer = Buffer.from(expectedSignature);
  const actualBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
};

export const parseJwtSub = (token: string): string | null => {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  const [headerPart, payloadPart, signaturePart] = parts;
  const header = parseJwtPart<JwtHeader>(headerPart);
  const payload = parseJwtPart<JwtPayload>(payloadPart);
  if (!header || !payload) {
    return null;
  }

  const config = getConfig();
  const sub = readValidatedSub(payload);
  if (!sub || !hasValidExpiry(payload)) {
    return null;
  }

  if (header.alg === "HS256") {
    if (!config.authJwtSecret || !verifyHs256Signature(`${headerPart}.${payloadPart}`, signaturePart, config.authJwtSecret)) {
      return null;
    }

    if (!hasExpectedIssuer(payload, config.authJwtIssuer)) {
      return null;
    }
    if (!hasExpectedAudience(payload, config.authJwtAudience)) {
      return null;
    }

    return sub;
  }

  if (
    header.alg === "none" &&
    signaturePart === "dev" &&
    config.nodeEnv === "development" &&
    config.allowUnsignedDevAuth &&
    config.devAuthAllowedUserIds.includes(sub)
  ) {
    return sub;
  }

  return null;
};

export const getUserIdFromAuthorizationHeader = (
  authorizationHeader: string | string[] | undefined
): string | null => {
  const headerValue = Array.isArray(authorizationHeader)
    ? authorizationHeader[0]
    : authorizationHeader;
  if (!headerValue || !headerValue.startsWith("Bearer ")) {
    return null;
  }

  const token = headerValue.slice("Bearer ".length).trim();
  return parseJwtSub(token);
};

export const requireAuthenticatedUser = (request: FastifyRequest): string | null =>
  getUserIdFromAuthorizationHeader(request.headers.authorization);
