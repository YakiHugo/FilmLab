const createFallbackId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export const createId = (prefix?: string) => {
  const baseId =
    typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : createFallbackId();
  const normalizedPrefix = typeof prefix === "string" ? prefix.trim() : "";

  return normalizedPrefix.length > 0 ? `${normalizedPrefix}-${baseId}` : baseId;
};
