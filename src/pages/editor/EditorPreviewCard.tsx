import { useMemo } from "react";
import type { EditingAdjustments, Asset } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ASPECT_RATIOS, PRESET_MAP } from "./constants";
import {
  buildPreviewFilter,
  buildPreviewTransform,
  getGrainStyle,
  getVignetteStyle,
} from "./utils";

interface EditorPreviewCardProps {
  selectedAsset: Asset | null;
  adjustments: EditingAdjustments | null;
  showOriginal: boolean;
  onToggleOriginal: () => void;
  onResetAll: () => void;
  onCopy: () => void;
  onPaste: () => void;
  canPaste: boolean;
}

export function EditorPreviewCard({
  selectedAsset,
  adjustments,
  showOriginal,
  onToggleOriginal,
  onResetAll,
  onCopy,
  onPaste,
  canPaste,
}: EditorPreviewCardProps) {
  const previewAspectRatio = useMemo(() => {
    if (!adjustments) {
      return "4 / 3";
    }
    return (
      ASPECT_RATIOS.find((ratio) => ratio.value === adjustments.aspectRatio)?.ratio ??
      "4 / 3"
    );
  }, [adjustments]);

  const presetLabel = useMemo(() => {
    if (!selectedAsset) {
      return "";
    }
    return PRESET_MAP.get(selectedAsset.presetId ?? "") ?? "未设置";
  }, [selectedAsset]);

  const previewStyle = useMemo(() => {
    if (!adjustments || showOriginal) {
      return undefined;
    }
    return {
      filter: buildPreviewFilter(adjustments),
      transform: buildPreviewTransform(adjustments),
    } as const;
  }, [adjustments, showOriginal]);

  const vignetteStyle = useMemo(() => {
    if (!adjustments) {
      return undefined;
    }
    return getVignetteStyle(adjustments);
  }, [adjustments]);

  const grainStyle = useMemo(() => {
    if (!adjustments) {
      return undefined;
    }
    return getGrainStyle(adjustments);
  }, [adjustments]);

  return (
    <Card className="min-w-0">
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <CardTitle>预览</CardTitle>
          {selectedAsset && (
            <p className="text-xs text-slate-400 line-clamp-1">
              {selectedAsset.name}
            </p>
          )}
        </div>
        {selectedAsset && (
          <span className="text-xs text-slate-400">预设：{presetLabel}</span>
        )}
      </CardHeader>
      <CardContent className="min-w-0">
        {selectedAsset ? (
          <div className="space-y-4">
            <div
              className="relative w-full overflow-hidden rounded-xl border border-slate-800 bg-slate-950"
              style={{ aspectRatio: previewAspectRatio }}
            >
              <img
                src={selectedAsset.objectUrl}
                alt={selectedAsset.name}
                className="h-full w-full object-cover transition duration-300 ease-out"
                style={previewStyle}
              />
              {!showOriginal && vignetteStyle && (
                <div
                  className="pointer-events-none absolute inset-0"
                  style={vignetteStyle}
                />
              )}
              {!showOriginal && grainStyle && (
                <div
                  className="pointer-events-none absolute inset-0"
                  style={grainStyle}
                />
              )}
              {showOriginal && (
                <span className="absolute left-3 top-3 rounded-full bg-slate-950/80 px-3 py-1 text-xs text-slate-200">
                  原图
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={showOriginal ? "default" : "secondary"}
                onClick={onToggleOriginal}
              >
                对比原图
              </Button>
              <Button size="sm" variant="secondary" onClick={onResetAll}>
                重置全部
              </Button>
              <Button size="sm" variant="secondary" onClick={onCopy}>
                复制设置
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={onPaste}
                disabled={!canPaste}
              >
                粘贴设置
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-400">请选择一张照片进行编辑。</p>
        )}
      </CardContent>
    </Card>
  );
}
