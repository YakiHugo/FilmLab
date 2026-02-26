import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RecommendFilmPresetCandidate } from "@/lib/ai/client";
import type { Asset, AssetUpdate, Preset } from "@/types";
import { useAiMatching } from "../hooks/useAiMatching";

interface AiMatchingCardProps {
  selectedAssets: Asset[];
  allPresets: Preset[];
  aiPresetCandidates: RecommendFilmPresetCandidate[];
  updateAsset: (assetId: string, update: AssetUpdate) => void;
}

export const AiMatchingCard = memo(
  ({ selectedAssets, allPresets, aiPresetCandidates, updateAsset }: AiMatchingCardProps) => {
    const { progress, failedAssets, retryFailed, isRunning } = useAiMatching({
      selectedAssets,
      allPresets,
      aiPresetCandidates,
      updateAsset,
      concurrency: 3,
    });

    const progressPercent =
      progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0;

    return (
      <Card className="animate-fade-up">
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>{"AI \u6ee4\u955c\u5339\u914d"}</CardTitle>
          <Badge className="border-white/10 bg-white/5 text-slate-200">
            {isRunning ? "\u8bc6\u522b\u4e2d" : "\u5df2\u5c31\u7eea"}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-300">
          <p>
            {"\u5df2\u5904\u7406"} {progress.processed}/{progress.total} {"\u5f20\uff0c\u6210\u529f"}{" "}
            {progress.succeeded} {"\u5f20\uff0c\u5931\u8d25"} {progress.failed} {"\u5f20\u3002"}
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
              onClick={retryFailed}
              disabled={isRunning || failedAssets.length === 0}
            >
              {"\u91cd\u8bd5\u5931\u8d25\u9879"}
            </Button>
            {failedAssets.length > 0 && (
              <span className="text-xs text-amber-300">
                {"\u5f53\u524d\u6709"} {failedAssets.length}{" "}
                {"\u5f20\u5931\u8d25\uff0c\u91cd\u8bd5\u524d\u4e0d\u4f1a\u6539\u52a8\u539f\u8bbe\u7f6e\u3002"}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }
);

AiMatchingCard.displayName = "AiMatchingCard";
