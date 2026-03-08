import { getConfig } from "../config";
import { ProviderError } from "../providers/types";

const isAbortError = (error: unknown) =>
  error instanceof Error && error.name === "AbortError";

const mergeAbortSignals = (signals: Array<AbortSignal | undefined>) => {
  const activeSignals = signals.filter(Boolean) as AbortSignal[];
  if (activeSignals.length <= 1) {
    return {
      signal: activeSignals[0],
      cleanup: () => undefined,
    };
  }

  const controller = new AbortController();
  const abort = () => {
    controller.abort();
  };

  for (const signal of activeSignals) {
    if (signal.aborted) {
      controller.abort();
      return {
        signal: controller.signal,
        cleanup: () => undefined,
      };
    }
  }

  for (const signal of activeSignals) {
    signal.addEventListener("abort", abort, { once: true });
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      for (const signal of activeSignals) {
        signal.removeEventListener("abort", abort);
      }
    },
  };
};

export const fetchWithTimeout = async (
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMessage: string,
  options?: { signal?: AbortSignal }
) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, getConfig().providerRequestTimeoutMs);
  const { signal, cleanup } = mergeAbortSignals([controller.signal, options?.signal]);

  try {
    return await fetch(input, {
      ...init,
      signal,
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
    cleanup();
  }
};
