const AUTH_TOKEN_STORAGE_KEY = "filmlab_auth_token";
const DEV_USER_ID_STORAGE_KEY = "filmlab_dev_user_id";
const DEFAULT_DEV_USER_ID = "local-user";

const encodeBase64Url = (value: string) =>
  btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

const decodeBase64Url = (value: string) => {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return atob(padded);
};

export const createDevJwtToken = (userId: string) => {
  const header = encodeBase64Url(JSON.stringify({ alg: "none", typ: "JWT" }));
  const payload = encodeBase64Url(
    JSON.stringify({
      sub: userId || DEFAULT_DEV_USER_ID,
      iat: Math.floor(Date.now() / 1000),
    })
  );
  return `${header}.${payload}.dev`;
};

export const getClientAuthToken = () => {
  if (typeof window === "undefined") {
    return createDevJwtToken(DEFAULT_DEV_USER_ID);
  }

  const token = window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
  if (token?.trim()) {
    return token.trim();
  }

  const storedDevUserId = window.localStorage.getItem(DEV_USER_ID_STORAGE_KEY) || DEFAULT_DEV_USER_ID;
  return createDevJwtToken(storedDevUserId);
};

export const getUserIdFromJwt = (token: string): string | null => {
  const parts = token.split(".");
  if (parts.length < 2) {
    return null;
  }

  try {
    const payload = JSON.parse(decodeBase64Url(parts[1] ?? "")) as { sub?: unknown };
    return typeof payload.sub === "string" && payload.sub.trim() ? payload.sub.trim() : null;
  } catch {
    return null;
  }
};

export const getCurrentUserId = () => getUserIdFromJwt(getClientAuthToken()) ?? DEFAULT_DEV_USER_ID;

