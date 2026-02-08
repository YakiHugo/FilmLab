import type { AssetMetadata, AiPresetRecommendation } from "@/types";

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

export const sleep = (durationMs: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, durationMs);
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
      throw new DOMException("The operation was aborted.", "AbortError");
    }
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= maxRetries) {
        break;
      }
      const delayMs = baseDelayMs * 2 ** (attempt - 1);
      await sleep(delayMs);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Recommendation request failed.");
};

export const requestFilmRecommendationWithRetry = async (
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
        throw new Error(`Recommendation request failed: ${response.status} ${text}`);
      }
      const parsed = (await response.json()) as Partial<RecommendFilmResponsePayload>;
      if (
        !parsed ||
        typeof parsed.model !== "string" ||
        !Array.isArray(parsed.topPresets)
      ) {
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
