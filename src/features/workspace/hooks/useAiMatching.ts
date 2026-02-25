import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { requestFilmRecommendationWithRetry } from "@/lib/ai/client";
import type { RecommendFilmPresetCandidate } from "@/lib/ai/client";
import { toRecommendationImageDataUrl } from "@/lib/ai/image";
import {
  DEFAULT_TOP_K,
  MAX_RECOMMENDATION_RETRIES,
  MAX_STYLE_SELECTION,
  findAutoApplyPreset,
  sanitizeTopPresetRecommendations,
} from "@/lib/ai/recommendationUtils";
import type { Asset, AssetUpdate, Preset } from "@/types";

interface AiMatchingSummary {
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
}

export interface AiMatchingProgress extends AiMatchingSummary {
  running: boolean;
}

interface UseAiMatchingOptions {
  selectedAssets: Asset[];
  allPresets: Preset[];
  aiPresetCandidates: RecommendFilmPresetCandidate[];
  updateAsset: (assetId: string, update: AssetUpdate) => void;
  concurrency?: number;
}

const createInitialAiProgress = (): AiMatchingProgress => ({
  running: false,
  total: 0,
  processed: 0,
  succeeded: 0,
  failed: 0,
});

const summarizeAiMatching = (
  assets: Asset[],
  excludedAssetIds?: Set<string>
): AiMatchingSummary => {
  let succeeded = 0;
  let failed = 0;

  assets.forEach((asset) => {
    if (excludedAssetIds?.has(asset.id)) {
      return;
    }

    const status = asset.aiRecommendation?.status;
    if (status === "succeeded") {
      succeeded += 1;
      return;
    }

    if (status === "failed") {
      failed += 1;
    }
  });

  return {
    total: assets.length,
    processed: succeeded + failed,
    succeeded,
    failed,
  };
};

const isAbortError = (error: unknown) =>
  error instanceof Error && error.name === "AbortError";

const resolveConcurrency = (value: number | undefined) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 3;
  }
  return Math.max(1, Math.floor(value));
};

export function useAiMatching({
  selectedAssets,
  allPresets,
  aiPresetCandidates,
  updateAsset,
  concurrency,
}: UseAiMatchingOptions) {
  const [progress, setProgress] = useState<AiMatchingProgress>(createInitialAiProgress);
  const [failedAssetIds, setFailedAssetIds] = useState<string[]>([]);

  const attemptedAssetIdsRef = useRef<Set<string>>(new Set());
  const inFlightControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);
  const isRunningRef = useRef(false);

  const selectedAssetById = useMemo(
    () => new Map(selectedAssets.map((asset) => [asset.id, asset])),
    [selectedAssets]
  );

  const persistedFailedIds = useMemo(
    () =>
      selectedAssets
        .filter((asset) => asset.aiRecommendation?.status === "failed")
        .map((asset) => asset.id),
    [selectedAssets]
  );

  const mergedFailedIds = useMemo(
    () =>
      Array.from(new Set([...persistedFailedIds, ...failedAssetIds])).filter((id) =>
        selectedAssetById.has(id)
      ),
    [failedAssetIds, persistedFailedIds, selectedAssetById]
  );

  const failedAssets = useMemo(
    () =>
      mergedFailedIds
        .map((assetId) => selectedAssetById.get(assetId))
        .filter((asset): asset is Asset => Boolean(asset)),
    [mergedFailedIds, selectedAssetById]
  );

  const selectedSummary = useMemo(() => summarizeAiMatching(selectedAssets), [selectedAssets]);

  const displayedProgress = useMemo<AiMatchingProgress>(
    () =>
      progress.running
        ? progress
        : {
            ...selectedSummary,
            running: false,
          },
    [progress, selectedSummary]
  );

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      inFlightControllerRef.current?.abort();
      inFlightControllerRef.current = null;
      isRunningRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (selectedAssets.length > 0) {
      return;
    }

    attemptedAssetIdsRef.current.clear();
    if (isMountedRef.current) {
      setFailedAssetIds([]);
      setProgress(createInitialAiProgress());
    }
  }, [selectedAssets.length]);

  useEffect(() => {
    const visibleIds = new Set(selectedAssets.map((asset) => asset.id));
    attemptedAssetIdsRef.current.forEach((assetId) => {
      if (!visibleIds.has(assetId)) {
        attemptedAssetIdsRef.current.delete(assetId);
      }
    });

    if (isMountedRef.current) {
      setFailedAssetIds((prev) => prev.filter((assetId) => visibleIds.has(assetId)));
    }
  }, [selectedAssets]);

  const runAiMatchingForAssets = useCallback(
    async (targetAssets: Asset[]) => {
      if (targetAssets.length === 0 || aiPresetCandidates.length === 0 || isRunningRef.current) {
        return;
      }

      const controller = new AbortController();
      const currentConcurrency = resolveConcurrency(concurrency);

      inFlightControllerRef.current?.abort();
      inFlightControllerRef.current = controller;
      isRunningRef.current = true;

      const candidateIds = aiPresetCandidates.map((item) => item.id);
      const targetAssetIds = new Set(targetAssets.map((asset) => asset.id));
      const baseSummary = summarizeAiMatching(selectedAssets, targetAssetIds);

      let processed = baseSummary.processed;
      let succeeded = baseSummary.succeeded;
      let failed = baseSummary.failed;

      if (isMountedRef.current) {
        setProgress({
          running: true,
          total: baseSummary.total,
          processed,
          succeeded,
          failed,
        });
      }

      const updateProgress = (status: "succeeded" | "failed") => {
        processed += 1;
        if (status === "succeeded") {
          succeeded += 1;
        } else {
          failed += 1;
        }

        if (isMountedRef.current) {
          setProgress({
            running: true,
            total: baseSummary.total,
            processed,
            succeeded,
            failed,
          });
        }
      };

      const processAsset = async (asset: Asset) => {
        try {
          const imageDataUrl = await toRecommendationImageDataUrl(asset);
          if (controller.signal.aborted) {
            return "aborted" as const;
          }

          const result = await requestFilmRecommendationWithRetry(
            {
              assetId: asset.id,
              imageDataUrl,
              metadata: asset.metadata,
              candidates: aiPresetCandidates,
              topK: DEFAULT_TOP_K,
            },
            {
              maxRetries: MAX_RECOMMENDATION_RETRIES,
              signal: controller.signal,
            }
          );

          if (controller.signal.aborted) {
            return "aborted" as const;
          }

          const topPresets = sanitizeTopPresetRecommendations(
            result.topPresets,
            candidateIds,
            DEFAULT_TOP_K
          );
          const autoPreset = findAutoApplyPreset(allPresets, topPresets);

          updateAsset(asset.id, {
            aiRecommendation: {
              version: 1,
              model: result.model,
              matchedAt: new Date().toISOString(),
              attempts: result.attempts,
              topPresets,
              autoAppliedPresetId: autoPreset?.id,
              status: "succeeded",
            },
            ...(autoPreset
              ? {
                  presetId: autoPreset.id,
                  intensity: autoPreset.intensity,
                  filmProfileId: autoPreset.filmProfileId,
                  filmProfile: autoPreset.filmProfile,
                  filmOverrides: undefined,
                }
              : {}),
          });

          if (isMountedRef.current) {
            setFailedAssetIds((prev) => prev.filter((assetId) => assetId !== asset.id));
          }

          attemptedAssetIdsRef.current.add(asset.id);
          updateProgress("succeeded");
          return "succeeded" as const;
        } catch (error) {
          if (controller.signal.aborted || isAbortError(error)) {
            return "aborted" as const;
          }

          updateAsset(asset.id, {
            aiRecommendation: {
              version: 1,
              model: "gpt-4.1-mini",
              matchedAt: new Date().toISOString(),
              attempts: MAX_RECOMMENDATION_RETRIES,
              topPresets: [],
              status: "failed",
            },
          });

          if (isMountedRef.current) {
            setFailedAssetIds((prev) =>
              prev.includes(asset.id) ? prev : [...prev, asset.id]
            );
          }

          attemptedAssetIdsRef.current.add(asset.id);
          updateProgress("failed");
          return "failed" as const;
        }
      };

      let nextIndex = 0;
      const workers = Array.from(
        { length: Math.min(currentConcurrency, targetAssets.length) },
        () =>
          (async () => {
            while (!controller.signal.aborted) {
              const asset = targetAssets[nextIndex];
              nextIndex += 1;
              if (!asset) {
                return;
              }

              const outcome = await processAsset(asset);
              if (outcome === "aborted") {
                return;
              }
            }
          })()
      );

      try {
        await Promise.all(workers);
      } finally {
        if (inFlightControllerRef.current === controller) {
          inFlightControllerRef.current = null;
        }
        isRunningRef.current = false;

        if (isMountedRef.current) {
          setProgress((current) => ({
            ...current,
            running: false,
          }));
        }
      }
    },
    [aiPresetCandidates, allPresets, concurrency, selectedAssets, updateAsset]
  );

  useEffect(() => {
    if (isRunningRef.current) {
      return;
    }

    const pendingAssets = selectedAssets
      .filter((asset) => !asset.aiRecommendation && !attemptedAssetIdsRef.current.has(asset.id))
      .slice(0, MAX_STYLE_SELECTION);
    const shouldRetryFailedOnEntry = attemptedAssetIdsRef.current.size === 0;
    const failedAssetsForReentry = shouldRetryFailedOnEntry
      ? selectedAssets.filter((asset) => asset.aiRecommendation?.status === "failed")
      : [];
    const pendingIds = new Set(pendingAssets.map((asset) => asset.id));
    const targetAssets = [
      ...pendingAssets,
      ...failedAssetsForReentry.filter((asset) => !pendingIds.has(asset.id)),
    ].slice(0, MAX_STYLE_SELECTION);

    if (targetAssets.length === 0) {
      return;
    }

    void runAiMatchingForAssets(targetAssets);
  }, [runAiMatchingForAssets, selectedAssets]);

  const retryFailed = useCallback(() => {
    if (isRunningRef.current || failedAssets.length === 0) {
      return;
    }

    void runAiMatchingForAssets(failedAssets);
  }, [failedAssets, runAiMatchingForAssets]);

  return {
    progress: displayedProgress,
    failedAssets,
    retryFailed,
    isRunning: displayedProgress.running,
  };
}
