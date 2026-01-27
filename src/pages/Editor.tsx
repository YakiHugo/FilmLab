import { useEffect, useMemo, useState } from "react";
import { Link, useSearch } from "@tanstack/react-router";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/layout/PageShell";
import { createDefaultAdjustments } from "@/lib/adjustments";
import { useProjectStore } from "@/stores/projectStore";
import type { EditingAdjustments } from "@/types";
import { presets } from "@/data/presets";
import { cn } from "@/lib/utils";
import { EditorPreviewCard } from "./editor/EditorPreviewCard";
import { EditorToolsCard } from "./editor/EditorToolsCard";
import { DEFAULT_ADJUSTMENTS } from "./editor/constants";
import { cloneAdjustments } from "./editor/utils";
import type { NumericAdjustmentKey } from "./editor/types";

export function Editor() {
  const { assets, updateAsset } = useProjectStore(
    useShallow((state) => ({
      assets: state.assets,
      updateAsset: state.updateAsset,
    }))
  );
  const { assetId } = useSearch({ from: "/editor" });
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [copiedAdjustments, setCopiedAdjustments] =
    useState<EditingAdjustments | null>(null);

  useEffect(() => {
    if (assetId && assets.some((asset) => asset.id === assetId)) {
      setSelectedAssetId(assetId);
    }
  }, [assetId, assets]);

  useEffect(() => {
    if (!selectedAssetId && assets.length > 0) {
      const fallbackId = assets.some((asset) => asset.id === assetId)
        ? assetId
        : assets[0].id;
      setSelectedAssetId(fallbackId ?? null);
    }
  }, [assets, assetId, selectedAssetId]);

  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.id === selectedAssetId) ?? null,
    [assets, selectedAssetId]
  );

  const adjustments = useMemo(() => {
    if (!selectedAsset) {
      return null;
    }
    return selectedAsset.adjustments ?? createDefaultAdjustments();
  }, [selectedAsset]);

  const presetLabel = useMemo(() => {
    if (!selectedAsset?.presetId) return "未设置";
    return presets.find((preset) => preset.id === selectedAsset.presetId)?.name ?? "未设置";
  }, [selectedAsset?.presetId]);

  const stats = selectedAsset
    ? [
        { label: "当前预设", value: presetLabel, hint: "可在滤镜中切换" },
        { label: "强度", value: `${selectedAsset.intensity ?? 0}`, hint: "0-100" },
        { label: "分组", value: selectedAsset.group ?? "未分组", hint: "批处理使用" },
      ]
    : [];

  const updateAdjustments = (partial: Partial<EditingAdjustments>) => {
    if (!selectedAsset || !adjustments) {
      return;
    }
    updateAsset(selectedAsset.id, {
      adjustments: {
        ...adjustments,
        ...partial,
      },
    });
  };

  const updateAdjustmentValue = (key: NumericAdjustmentKey, value: number) => {
    updateAdjustments({ [key]: value } as Partial<EditingAdjustments>);
  };

  const handleResetAll = () => {
    if (!selectedAsset) {
      return;
    }
    updateAsset(selectedAsset.id, { adjustments: createDefaultAdjustments() });
  };

  const handleResetTool = (toolId: NumericAdjustmentKey | null) => {
    if (!toolId) {
      return;
    }
    updateAdjustments({
      [toolId]: DEFAULT_ADJUSTMENTS[toolId],
    } as Partial<EditingAdjustments>);
  };

  const handleCopy = () => {
    if (!adjustments) {
      return;
    }
    setCopiedAdjustments(cloneAdjustments(adjustments));
  };

  const handlePaste = () => {
    if (!selectedAsset || !copiedAdjustments) {
      return;
    }
    updateAsset(selectedAsset.id, { adjustments: cloneAdjustments(copiedAdjustments) });
  };

  const handleSelectPreset = (presetId: string) => {
    if (!selectedAsset) {
      return;
    }
    updateAsset(selectedAsset.id, { presetId });
  };

  const handleSetIntensity = (value: number) => {
    if (!selectedAsset) {
      return;
    }
    updateAsset(selectedAsset.id, { intensity: value });
  };

  return (
    <PageShell
      title="精修编辑"
      kicker="Fine Tune"
      description="移动端优先调参，左右滑动快速切换素材。"
      actions={
        <>
          <Button className="w-full sm:w-auto" variant="secondary" asChild>
            <Link to="/library">返回素材库</Link>
          </Button>
          <Button className="w-full sm:w-auto" variant="ghost" asChild>
            <Link to="/batch">进入批处理</Link>
          </Button>
        </>
      }
      stats={stats}
    >
      <div className="flex min-w-0 flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:items-start">
        <div className="min-w-0 space-y-4">
          {assets.length > 0 && (
            <div className="flex gap-3 overflow-x-auto pb-2">
              {assets.map((asset) => {
                const isActive = asset.id === selectedAssetId;
                return (
                  <button
                    key={asset.id}
                    type="button"
                    className={cn(
                      "flex min-w-[180px] items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/60 p-3 text-left transition",
                      isActive && "border-amber-200/40 bg-amber-300/10"
                    )}
                    onClick={() => setSelectedAssetId(asset.id)}
                  >
                    <img
                      src={asset.objectUrl}
                      alt={asset.name}
                      className="h-12 w-12 rounded-xl object-cover"
                    />
                    <div className="text-xs text-slate-300">
                      <p className="font-medium text-slate-100 line-clamp-1">
                        {asset.name}
                      </p>
                      <p>分组：{asset.group ?? "未分组"}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          <div className="animate-fade-up">
            <EditorPreviewCard
              selectedAsset={selectedAsset}
              adjustments={adjustments}
              showOriginal={showOriginal}
              onToggleOriginal={() => setShowOriginal((prev) => !prev)}
              onResetAll={handleResetAll}
              onCopy={handleCopy}
              onPaste={handlePaste}
              canPaste={Boolean(copiedAdjustments)}
            />
          </div>
        </div>

        <div className="min-w-0 space-y-6">
          <div className="animate-fade-up" style={{ animationDelay: "80ms" }}>
            <EditorToolsCard
              selectedAsset={selectedAsset}
              adjustments={adjustments}
              onUpdateAdjustments={updateAdjustments}
              onUpdateAdjustmentValue={updateAdjustmentValue}
              onSelectPreset={handleSelectPreset}
              onSetIntensity={handleSetIntensity}
              onResetTool={handleResetTool}
            />
          </div>
        </div>
      </div>
    </PageShell>
  );
}
