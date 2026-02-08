import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RecommendFilmPresetCandidate } from "@/lib/ai/client";
import { requestFilmRecommendationWithRetry } from "@/lib/ai/client";
import { toRecommendationImageDataUrl } from "@/lib/ai/image";
import {
  DEFAULT_TOP_K,
  MAX_RECOMMENDATION_RETRIES,
  MAX_STYLE_SELECTION,
  findAutoApplyPreset,
  sanitizeTopPresetRecommendations,
} from "@/lib/ai/recommendationUtils";
import type { Asset, Preset } from "@/types";

interface AiMatchingProgress {
  running: boolean;
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
}

const createInitialAiProgress = (): AiMatchingProgress => ({
  running: false,
  total: 0,
  processed: 0,
  succeeded: 0,
  failed: 0,
});

interface AiMatchingCardProps {
  selectedAssets: Asset[];
  allPresets: Preset[];
  aiPresetCandidates: RecommendFilmPresetCandidate[];
  updateAsset: (assetId: string, update: Partial<Asset>) => void;
}

export const AiMatchingCard = memo(
  ({
    selectedAssets,
    allPresets,
    aiPresetCandidates,
    updateAsset,
  }: AiMatchingCardProps) => {
    const [progress, setProgress] = useState<AiMatchingProgress>(
      createInitialAiProgress,
    );
    const [failedAssetIds, setFailedAssetIds] = useState<string[]>([]);
    const attemptedAssetIdsRef = useRef<Set<string>>(new Set());
    const aiRunInFlightRef = useRef(false);

    const selectedAssetById = useMemo(
      () => new Map(selectedAssets.map((asset) => [asset.id, asset])),
      [selectedAssets],
    );
    const persistedFailedIds = useMemo(
      () =>
        selectedAssets
          .filter((asset) => asset.aiRecommendation?.status === "failed")
          .map((asset) => asset.id),
      [selectedAssets],
    );
    const mergedFailedIds = useMemo(
      () =>
        Array.from(new Set([...persistedFailedIds, ...failedAssetIds])).filter(
          (id) => selectedAssetById.has(id),
        ),
      [failedAssetIds, persistedFailedIds, selectedAssetById],
    );
    const failedAssets = useMemo(
      () =>
        mergedFailedIds
          .map((assetId) => selectedAssetById.get(assetId))
          .filter((asset): asset is Asset => Boolean(asset)),
      [mergedFailedIds, selectedAssetById],
    );
    const displayedTotal = progress.total || selectedAssets.length;
    const progressPercent =
      progress.total > 0
        ? Math.round((progress.processed / progress.total) * 100)
        : 0;

    useEffect(() => {
      if (selectedAssets.length > 0) {
        return;
      }
      attemptedAssetIdsRef.current.clear();
      setFailedAssetIds([]);
      setProgress(createInitialAiProgress());
    }, [selectedAssets.length]);

    useEffect(() => {
      const visibleIds = new Set(selectedAssets.map((asset) => asset.id));
      attemptedAssetIdsRef.current.forEach((assetId) => {
        if (!visibleIds.has(assetId)) {
          attemptedAssetIdsRef.current.delete(assetId);
        }
      });
      setFailedAssetIds((prev) =>
        prev.filter((assetId) => visibleIds.has(assetId)),
      );
    }, [selectedAssets]);

    const runAiMatchingForAssets = useCallback(
      async (targetAssets: Asset[]) => {
        if (targetAssets.length === 0 || aiPresetCandidates.length === 0) {
          return;
        }

        const candidateIds = aiPresetCandidates.map((item) => item.id);
        let processed = 0;
        let succeeded = 0;
        let failed = 0;

        aiRunInFlightRef.current = true;
        setProgress({
          running: true,
          total: targetAssets.length,
          processed: 0,
          succeeded: 0,
          failed: 0,
        });

        for (const asset of targetAssets) {
          try {
            const imageDataUrl = await toRecommendationImageDataUrl(asset);
            const result = await requestFilmRecommendationWithRetry(
              {
                assetId: asset.id,
                imageDataUrl,
                metadata: asset.metadata,
                candidates: aiPresetCandidates,
                topK: DEFAULT_TOP_K,
              },
              { maxRetries: MAX_RECOMMENDATION_RETRIES },
            );

            const topPresets = sanitizeTopPresetRecommendations(
              result.topPresets,
              candidateIds,
              DEFAULT_TOP_K,
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
            setFailedAssetIds((prev) =>
              prev.filter((assetId) => assetId !== asset.id),
            );
            succeeded += 1;
          } catch {
            setFailedAssetIds((prev) =>
              prev.includes(asset.id) ? prev : [...prev, asset.id],
            );
            failed += 1;
          } finally {
            attemptedAssetIdsRef.current.add(asset.id);
            processed += 1;
            setProgress({
              running: true,
              total: targetAssets.length,
              processed,
              succeeded,
              failed,
            });
          }
        }

        aiRunInFlightRef.current = false;
        setProgress((current) => ({
          ...current,
          running: false,
        }));
      },
      [aiPresetCandidates, allPresets, updateAsset],
    );

    useEffect(() => {
      if (aiRunInFlightRef.current) {
        return;
      }
      const pendingAssets = selectedAssets
        .filter(
          (asset) =>
            !asset.aiRecommendation &&
            !attemptedAssetIdsRef.current.has(asset.id),
        )
        .slice(0, MAX_STYLE_SELECTION);
      if (pendingAssets.length === 0) {
        return;
      }
      void runAiMatchingForAssets(pendingAssets);
    }, [runAiMatchingForAssets, selectedAssets]);

    const handleRetryFailedRecommendations = useCallback(() => {
      if (aiRunInFlightRef.current || failedAssets.length === 0) {
        return;
      }
      void runAiMatchingForAssets(failedAssets);
    }, [failedAssets, runAiMatchingForAssets]);

    return (
      <Card className="animate-fade-up">
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>AI 滤镜匹配</CardTitle>
          <Badge className="border-white/10 bg-white/5 text-slate-200">
            {progress.running ? "识别中" : "已就绪"}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-300">
          <p>
            已处理 {progress.processed}/{displayedTotal} 张， 成功{" "}
            {progress.succeeded} 张，失败 {progress.failed} 张。
          </p>
          <div className="rounded-full border border-white/10 bg-slate-950/60">
            <div
              className="h-2 rounded-full bg-sky-300 transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={handleRetryFailedRecommendations}
              disabled={progress.running || failedAssets.length === 0}
            >
              重试失败项
            </Button>
            {failedAssets.length > 0 && (
              <span className="text-xs text-amber-300">
                当前有 {failedAssets.length} 张失败，重试前不会改动原设置。
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    );
  },
);

AiMatchingCard.displayName = "AiMatchingCard";
