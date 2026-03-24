let fallbackCounter = 0;

const createFallbackId = () => {
  fallbackCounter += 1;
  return `${Date.now().toString(36)}-${fallbackCounter.toString(36)}`;
};

export const createId = (prefix?: string) => {
  const baseId =
    typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : createFallbackId();
  const normalizedPrefix = typeof prefix === "string" ? prefix.trim() : "";

  return normalizedPrefix.length > 0 ? `${normalizedPrefix}-${baseId}` : baseId;
};
