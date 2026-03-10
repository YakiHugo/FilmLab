import { ProviderError } from "../../providers/base/errors";

const RETRIABLE_STATUS_CODES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

export const isRetriableProviderError = (error: unknown) =>
  error instanceof ProviderError && RETRIABLE_STATUS_CODES.has(error.statusCode);
