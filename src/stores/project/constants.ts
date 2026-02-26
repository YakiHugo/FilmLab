export const DEFAULT_PROJECT_ID = "default";
export const LEGACY_PROJECT_ID = "default-project";
export const DEFAULT_PROJECT_NAME = "FilmLab 项目";

export const MAX_IMPORT_FILE_SIZE = 50 * 1024 * 1024;
export const MAX_IMPORT_BATCH_SIZE = 500;
export const IMPORT_PROGRESS_THROTTLE_MS = 100;
export const IMPORT_COMMIT_CHUNK_SIZE = 20;
export const DEFAULT_IMPORT_CONCURRENCY = 4;
export const MIN_IMPORT_CONCURRENCY = 2;
export const MAX_IMPORT_CONCURRENCY = 6;

const SUPPORTED_IMPORT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const SUPPORTED_IMPORT_EXTENSIONS = /\.(jpe?g|png|webp)$/i;

export const isSupportedImportFile = (file: File) => {
  if (SUPPORTED_IMPORT_TYPES.has(file.type)) {
    return true;
  }
  return SUPPORTED_IMPORT_EXTENSIONS.test(file.name);
};

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

