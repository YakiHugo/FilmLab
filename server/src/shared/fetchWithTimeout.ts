import { getConfig } from "../config";
import { ProviderError } from "../providers/types";

const isAbortError = (error: unknown) =>
  error instanceof Error && error.name === "AbortError";

export const fetchWithTimeout = async (
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMessage: string
) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, getConfig().providerRequestTimeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof ProviderError) {
      throw error;
    }
    if (isAbortError(error)) {
      throw new ProviderError(timeoutMessage, 504, error);
    }
    throw new ProviderError("Provider request failed.", 502, error);
  } finally {
    clearTimeout(timeoutId);
  }
};
