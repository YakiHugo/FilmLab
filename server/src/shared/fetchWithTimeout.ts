import { getConfig } from "../config";
import { normalizeProviderRequestError } from "../providers/errorNormalizer";
import type { ImageProviderId } from "../shared/imageGenerationSchema";

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
  options?: { signal?: AbortSignal; provider?: ImageProviderId }
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
    if (isAbortError(error)) {
      throw normalizeProviderRequestError({
        error,
        fallbackMessage: "Provider request failed.",
        timeoutMessage,
        provider: options?.provider,
      });
    }

    throw normalizeProviderRequestError({
      error,
      fallbackMessage: "Provider request failed.",
      timeoutMessage,
      provider: options?.provider,
    });
  } finally {
    clearTimeout(timeoutId);
    cleanup();
  }
};
