export const MAX_IMPORT_FILE_SIZE = 50 * 1024 * 1024;
export const MAX_IMPORT_BATCH_SIZE = 500;
export const IMPORT_PROGRESS_THROTTLE_MS = 100;
export const IMPORT_COMMIT_CHUNK_SIZE = 20;
export const DEFAULT_IMPORT_CONCURRENCY = 4;
export const MIN_IMPORT_CONCURRENCY = 2;
export const MAX_IMPORT_CONCURRENCY = 6;

const SUPPORTED_IMPORT_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const SUPPORTED_IMPORT_EXTENSION_TYPES = [
  { extension: /\.jpe?g$/i, mimeType: "image/jpeg" },
  { extension: /\.png$/i, mimeType: "image/png" },
  { extension: /\.webp$/i, mimeType: "image/webp" },
  { extension: /\.avif$/i, mimeType: "image/avif" },
] as const;

export const resolveSupportedImportMimeType = (file: Pick<File, "name" | "type">) => {
  const declaredType = file.type.trim().toLowerCase();
  if (SUPPORTED_IMPORT_TYPES.has(declaredType)) {
    return declaredType;
  }
  return (
    SUPPORTED_IMPORT_EXTENSION_TYPES.find(({ extension }) => extension.test(file.name))?.mimeType ??
    null
  );
};

export const isSupportedImportFile = (file: File) => resolveSupportedImportMimeType(file) !== null;

export const resolveImportConcurrency = () => {
  const hardware =
    typeof navigator !== "undefined" && Number.isFinite(navigator.hardwareConcurrency)
      ? navigator.hardwareConcurrency
      : DEFAULT_IMPORT_CONCURRENCY;
  const preferred = Math.floor(hardware / 2);
  return Math.max(
    MIN_IMPORT_CONCURRENCY,
    Math.min(MAX_IMPORT_CONCURRENCY, preferred || DEFAULT_IMPORT_CONCURRENCY)
  );
};
