const toBoolean = (value: unknown, fallback: boolean) => {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "1" || normalized === "true" || normalized === "on") {
      return true;
    }
    if (normalized === "0" || normalized === "false" || normalized === "off") {
      return false;
    }
  }
  return fallback;
};

const readLocalStorageFlag = (key: string) => {
  if (typeof window === "undefined") {
    return undefined;
  }
  try {
    const raw = window.localStorage.getItem(key);
    if (raw == null) {
      return undefined;
    }
    return toBoolean(raw, false);
  } catch {
    return undefined;
  }
};

const readFlag = (envKey: string, storageKey: string, fallback: boolean) => {
  const envValue = import.meta.env[envKey];
  const storageValue = readLocalStorageFlag(storageKey);
  if (typeof storageValue === "boolean") {
    return storageValue;
  }
  return toBoolean(envValue, fallback);
};

export const featureFlags = {
  enableCubeLut: readFlag("VITE_ENABLE_CUBE_LUT", "filmlab.flag.enableCubeLut", false),
  enableWorkerExport: readFlag(
    "VITE_ENABLE_WORKER_EXPORT",
    "filmlab.flag.enableWorkerExport",
    false
  ),
  enableSeedUi: readFlag("VITE_ENABLE_SEED_UI", "filmlab.flag.enableSeedUi", false),
} as const;

