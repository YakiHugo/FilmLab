import { useEffect, useMemo, useState } from "react";
import { useSearch } from "@tanstack/react-router";
import { createDefaultAdjustments } from "@/lib/adjustments";
import { useProjectStore } from "@/stores/projectStore";
import type { EditingAdjustments } from "@/types";
import { EditorPreviewCard } from "./editor/EditorPreviewCard";
import { EditorToolsCard } from "./editor/EditorToolsCard";
import { DEFAULT_ADJUSTMENTS } from "./editor/constants";
import { cloneAdjustments } from "./editor/utils";
import type { NumericAdjustmentKey } from "./editor/types";

export function Editor() {
  const { assets, init, updateAsset } = useProjectStore();
  const { assetId } = useSearch({ from: "/editor" });
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [copiedAdjustments, setCopiedAdjustments] =
    useState<EditingAdjustments | null>(null);

  useEffect(() => {
    void init();
  }, [init]);

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
    <div className="flex min-w-0 flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:items-start">
      <div className="min-w-0 space-y-6">
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

      <div className="min-w-0 space-y-6">
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
  );
}
