import type { AssetMetadata, AiPresetRecommendation } from "@/types";
import { AiError, type AiErrorCode } from "./errors";

export interface RecommendFilmPresetCandidate {
  id: string;
  name: string;
  description: string;
  tags: string[];
  intensity: number;
  isCustom: boolean;
}

export interface RecommendFilmRequestPayload {
  assetId: string;
  imageDataUrl: string;
  metadata?: Partial<AssetMetadata>;
  candidates: RecommendFilmPresetCandidate[];
  topK: number;
  provider?: string;
  model?: string;
}

export interface RecommendFilmResponsePayload {
  model: string;
  topPresets: AiPresetRecommendation[];
}

interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  signal?: AbortSignal;
}

interface RecommendFilmOptions extends RetryOptions {
  fetchImpl?: typeof fetch;
}

const createAbortError = () => {
  if (typeof DOMException === "function") {
    return new DOMException("The operation was aborted.", "AbortError");
  }
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
};

const isAbortError = (error: unknown) =>
  error instanceof Error && error.name === "AbortError";

export const sleep = (durationMs: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError());
      return;
    }

    const handleAbort = () => {
      clearTimeout(timeoutId);
      if (signal) {
        signal.removeEventListener("abort", handleAbort);
      }
      reject(createAbortError());
    };

    const timeoutId = setTimeout(() => {
      if (signal) {
        signal.removeEventListener("abort", handleAbort);
      }
      resolve();
    }, durationMs);

    signal?.addEventListener("abort", handleAbort, { once: true });
  });

export const retryWithBackoff = async <T>(
  operation: (attempt: number) => Promise<T>,
  options?: RetryOptions
) => {
  const maxRetries = options?.maxRetries ?? 3;
  const baseDelayMs = options?.baseDelayMs ?? 300;
  let attempt = 0;
  let lastError: unknown;

  while (attempt < maxRetries) {
    attempt += 1;
    if (options?.signal?.aborted) {
      throw createAbortError();
    }
    try {
      return await operation(attempt);
    } catch (error) {
      if (options?.signal?.aborted || isAbortError(error)) {
        throw createAbortError();
      }
      lastError = error;
      if (attempt >= maxRetries) {
        break;
      }
      const delayMs = baseDelayMs * 2 ** (attempt - 1);
      await sleep(delayMs, options?.signal);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Recommendation request failed.");
};

// Deduplication: prevent duplicate in-flight requests for the same asset
const inFlightRequests = new Map<string, Promise<RecommendFilmResponsePayload & { attempts: number }>>();

export const requestFilmRecommendationWithRetry = async (
  payload: RecommendFilmRequestPayload,
  options?: RecommendFilmOptions
) => {
  const dedupeKey = payload.assetId;
  const existing = inFlightRequests.get(dedupeKey);
  if (existing) {
    return existing;
  }

  const promise = _requestFilmRecommendationImpl(payload, options).finally(() => {
    inFlightRequests.delete(dedupeKey);
  });

  inFlightRequests.set(dedupeKey, promise);
  return promise;
};

const _requestFilmRecommendationImpl = async (
  payload: RecommendFilmRequestPayload,
  options?: RecommendFilmOptions
) => {
  const fetchImpl = options?.fetchImpl ?? fetch;
  let attempts = 0;

  const data = await retryWithBackoff<RecommendFilmResponsePayload>(
    async (attempt) => {
      attempts = attempt;
      const response = await fetchImpl("/api/recommend-film", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: options?.signal,
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        // Try to parse structured AiError from server
        try {
          const parsed = JSON.parse(text) as { error?: string; code?: AiErrorCode };
          if (parsed.code) {
            throw new AiError(parsed.error ?? "Request failed.", parsed.code, {
              statusCode: response.status,
              retryable: response.status === 429 || response.status >= 500,
            });
          }
        } catch (e) {
          if (e instanceof AiError) throw e;
        }
        throw AiError.fromHttpStatus(response.status, text);
      }
      const parsed = (await response.json()) as Partial<RecommendFilmResponsePayload>;
      if (!parsed || typeof parsed.model !== "string" || !Array.isArray(parsed.topPresets)) {
        throw new Error("Invalid recommendation response payload.");
      }
      return {
        model: parsed.model,
        topPresets: parsed.topPresets,
      };
    },
    {
      maxRetries: options?.maxRetries,
      baseDelayMs: options?.baseDelayMs,
      signal: options?.signal,
    }
  );

  return {
    ...data,
    attempts,
  };
};
