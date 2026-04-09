import { jwtVerify } from "jose";
import type { AuthConfig } from "../config";

interface JwtHeader {
  alg?: unknown;
}

interface JwtPayload {
  sub?: unknown;
}

const decodeBase64Url = (value: string) => {
  const padded = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Buffer.from(padded, "base64").toString("utf8");
};

const parseJwtPart = <T>(value: string): T | null => {
  try {
    return JSON.parse(decodeBase64Url(value)) as T;
  } catch {
    return null;
  }
};

const readValidatedSub = (payload: JwtPayload) =>
  typeof payload.sub === "string" && payload.sub.trim() ? payload.sub.trim() : null;

export const parseJwtSub = async (token: string, config: AuthConfig): Promise<string | null> => {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  const [headerPart, , signaturePart] = parts;
  const header = parseJwtPart<JwtHeader>(headerPart);
  if (!header) {
    return null;
  }

  // Dev mode unsigned tokens — jose won't handle alg: "none"
  if (
    header.alg === "none" &&
    signaturePart === "dev" &&
    config.nodeEnv === "development" &&
    config.allowUnsignedDevAuth
  ) {
    const payload = parseJwtPart<JwtPayload>(parts[1]);
    if (!payload) return null;
    const sub = readValidatedSub(payload);
    return sub && config.devAuthAllowedUserIds.includes(sub) ? sub : null;
  }

  // HS256 via jose
  if (!config.authJwtSecret) {
    return null;
  }

  const secret = new TextEncoder().encode(config.authJwtSecret);
  try {
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ["HS256"],
      ...(config.authJwtIssuer ? { issuer: config.authJwtIssuer } : {}),
      ...(config.authJwtAudience ? { audience: config.authJwtAudience } : {}),
    });
    return typeof payload.sub === "string" && payload.sub.trim()
      ? payload.sub.trim()
      : null;
  } catch {
    return null;
  }
};

export const getUserIdFromAuthorizationHeader = async (
  authorizationHeader: string | string[] | undefined,
  config: AuthConfig
): Promise<string | null> => {
  const headerValue = Array.isArray(authorizationHeader)
    ? authorizationHeader[0]
    : authorizationHeader;
  if (!headerValue || !headerValue.startsWith("Bearer ")) {
    return null;
  }

  const token = headerValue.slice("Bearer ".length).trim();
  return parseJwtSub(token, config);
};
