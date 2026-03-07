import type { ApiRequest, ApiResponse } from "../_utils";
import { sendError } from "../_utils";

const decodeBase64Url = (value: string) => {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Buffer.from(padded, "base64").toString("utf8");
};

const parseJwtSub = (token: string): string | null => {
  const parts = token.split(".");
  if (parts.length < 2) {
    return null;
  }
  try {
    const payload = JSON.parse(decodeBase64Url(parts[1] ?? "")) as { sub?: unknown };
    if (typeof payload.sub === "string" && payload.sub.trim()) {
      return payload.sub.trim();
    }
    return null;
  } catch {
    return null;
  }
};

export const requireUserId = (request: ApiRequest, response: ApiResponse): string | null => {
  const auth = request.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    sendError(response, 401, "Missing Bearer token.");
    return null;
  }
  const token = auth.slice("Bearer ".length).trim();
  const userId = parseJwtSub(token);
  if (!userId) {
    sendError(response, 401, "Invalid token payload.");
    return null;
  }
  return userId;
};

