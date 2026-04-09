import { ProviderError } from "../providers/base/errors";

const isAbortError = (error: unknown) =>
  error instanceof Error && error.name === "AbortError";

const wireAbortSignal = (
  signal: AbortSignal | undefined,
  onExternalAbort: () => void
) => {
  if (!signal) {
    return () => undefined;
  }

  if (signal.aborted) {
    onExternalAbort();
    return () => undefined;
  }

  const abort = () => {
    onExternalAbort();
  };
  signal.addEventListener("abort", abort, { once: true });

  return () => {
    signal.removeEventListener("abort", abort);
  };
};

export const fetchWithTimeout = async (
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMessage: string,
  options: { signal?: AbortSignal; timeoutMs: number }
) => {
  const controller = new AbortController();
  let abortedByTimeout = false;
  let abortedByExternalSignal = false;
  const timeoutId = setTimeout(() => {
    abortedByTimeout = true;
    controller.abort();
  }, options.timeoutMs);
  const cleanup = wireAbortSignal(options?.signal, () => {
    abortedByExternalSignal = true;
    controller.abort();
  });

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
      if (abortedByExternalSignal && !abortedByTimeout) {
        throw error;
      }
      throw new ProviderError(timeoutMessage, 504, error);
    }
    throw new ProviderError("Provider request failed.", 502, error);
  } finally {
    clearTimeout(timeoutId);
    cleanup();
  }
};
