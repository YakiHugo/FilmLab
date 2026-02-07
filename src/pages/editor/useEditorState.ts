import { useCallback, useEffect, useMemo, useState } from "react";
import { presets as basePresets } from "@/data/presets";
import { createDefaultAdjustments } from "@/lib/adjustments";
import type { Asset, EditingAdjustments, HslColorKey, Preset } from "@/types";
import { cloneAdjustments } from "./utils";
import { DEFAULT_OPEN_SECTIONS, type CurveChannel, type SectionId } from "./editorPanelConfig";
import {
  buildCustomAdjustments,
  loadCustomPresets,
  mergePresetsById,
  normalizeImportedPresets,
  resolveAdjustments,
  saveCustomPresets,
} from "./presetUtils";
import type { NumericAdjustmentKey } from "./types";

interface UseEditorStateParams {
  assets: Asset[];
  assetId: string | undefined;
  updateAsset: (assetId: string, update: Partial<Asset>) => void;
}

export function useEditorState({ assets, assetId, updateAsset }: UseEditorStateParams) {
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [copiedAdjustments, setCopiedAdjustments] =
    useState<EditingAdjustments | null>(null);
  const [customPresetName, setCustomPresetName] = useState("");
  const [customPresets, setCustomPresets] = useState<Preset[]>(() => loadCustomPresets());
  const [activeHslColor, setActiveHslColor] = useState<HslColorKey>("red");
  const [curveChannel, setCurveChannel] = useState<CurveChannel>("rgb");
  const [openSections, setOpenSections] = useState<Record<SectionId, boolean>>(() => ({
    ...DEFAULT_OPEN_SECTIONS,
  }));

  useEffect(() => {
    saveCustomPresets(customPresets);
  }, [customPresets]);

  useEffect(() => {
    if (assetId && assets.some((asset) => asset.id === assetId)) {
      setSelectedAssetId(assetId);
    }
  }, [assetId, assets]);

  useEffect(() => {
    if (selectedAssetId || assets.length === 0) {
      return;
    }
    const fallbackId = assets.some((asset) => asset.id === assetId)
      ? assetId
      : assets[0].id;
    setSelectedAssetId(fallbackId ?? null);
  }, [assetId, assets, selectedAssetId]);

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

  const allPresets = useMemo(() => [...basePresets, ...customPresets], [customPresets]);

  const previewAdjustments = useMemo(() => {
    if (!selectedAsset || !adjustments) {
      return null;
    }
    return resolveAdjustments(
      adjustments,
      selectedAsset.presetId,
      selectedAsset.intensity,
      allPresets
    );
  }, [adjustments, allPresets, selectedAsset]);

  const presetLabel = useMemo(() => {
    if (!selectedAsset?.presetId) {
      return "未设置";
    }
    return (
      allPresets.find((preset) => preset.id === selectedAsset.presetId)?.name ??
      "未设置"
    );
  }, [allPresets, selectedAsset?.presetId]);

  const updateAdjustments = useCallback(
    (partial: Partial<EditingAdjustments>) => {
      if (!selectedAsset || !adjustments) {
        return;
      }
      updateAsset(selectedAsset.id, {
        adjustments: {
          ...adjustments,
          ...partial,
        },
      });
    },
    [adjustments, selectedAsset, updateAsset]
  );

  const updateAdjustmentValue = useCallback(
    (key: NumericAdjustmentKey, value: number) => {
      updateAdjustments({ [key]: value } as Partial<EditingAdjustments>);
    },
    [updateAdjustments]
  );

  const updateHslValue = useCallback(
    (
      color: HslColorKey,
      channel: "hue" | "saturation" | "luminance",
      value: number
    ) => {
      if (!adjustments) {
        return;
      }
      updateAdjustments({
        hsl: {
          ...adjustments.hsl,
          [color]: {
            ...adjustments.hsl[color],
            [channel]: value,
          },
        },
      });
    },
    [adjustments, updateAdjustments]
  );

  const toggleFlip = useCallback(
    (axis: "flipHorizontal" | "flipVertical") => {
      if (!adjustments) {
        return;
      }
      updateAdjustments({ [axis]: !adjustments[axis] } as Partial<EditingAdjustments>);
    },
    [adjustments, updateAdjustments]
  );

  const handleResetAll = useCallback(() => {
    if (!selectedAsset) {
      return;
    }
    updateAsset(selectedAsset.id, { adjustments: createDefaultAdjustments() });
  }, [selectedAsset, updateAsset]);

  const handleCopy = useCallback(() => {
    if (!adjustments) {
      return;
    }
    setCopiedAdjustments(cloneAdjustments(adjustments));
  }, [adjustments]);

  const handlePaste = useCallback(() => {
    if (!selectedAsset || !copiedAdjustments) {
      return;
    }
    updateAsset(selectedAsset.id, { adjustments: cloneAdjustments(copiedAdjustments) });
  }, [copiedAdjustments, selectedAsset, updateAsset]);

  const handleSelectPreset = useCallback(
    (presetId: string) => {
      if (!selectedAsset) {
        return;
      }
      updateAsset(selectedAsset.id, { presetId });
    },
    [selectedAsset, updateAsset]
  );

  const handleSetIntensity = useCallback(
    (value: number) => {
      if (!selectedAsset) {
        return;
      }
      updateAsset(selectedAsset.id, { intensity: value });
    },
    [selectedAsset, updateAsset]
  );

  const handleSaveCustomPreset = useCallback(() => {
    if (!previewAdjustments) {
      return;
    }
    const name = customPresetName.trim();
    if (!name) {
      return;
    }
    const custom: Preset = {
      id: `custom-${Date.now()}`,
      name,
      tags: (basePresets[0]?.tags ?? []) as Preset["tags"],
      intensity: 100,
      description: "自定义风格",
      adjustments: buildCustomAdjustments(previewAdjustments),
    };
    setCustomPresets((prev) => [custom, ...prev]);
    setCustomPresetName("");
    if (selectedAsset) {
      updateAsset(selectedAsset.id, { presetId: custom.id, intensity: 100 });
    }
  }, [customPresetName, previewAdjustments, selectedAsset, updateAsset]);

  const handleExportPresets = useCallback(() => {
    if (customPresets.length === 0) {
      return;
    }
    const blob = new Blob([JSON.stringify(customPresets, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "filmlab-presets.json";
    link.click();
    URL.revokeObjectURL(url);
  }, [customPresets]);

  const handleImportPresets = useCallback(async (file: File | null) => {
    if (!file) {
      return;
    }
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const normalized = normalizeImportedPresets(parsed);
      if (normalized.length > 0) {
        setCustomPresets((prev) => mergePresetsById(prev, normalized));
      }
    } catch {
      return;
    }
  }, []);

  const toggleSection = useCallback((id: SectionId) => {
    setOpenSections((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  }, []);

  const toggleOriginal = useCallback(() => {
    setShowOriginal((prev) => !prev);
  }, []);

  return {
    selectedAssetId,
    selectedAsset,
    adjustments,
    previewAdjustments,
    presetLabel,
    showOriginal,
    copiedAdjustments,
    customPresetName,
    customPresets,
    activeHslColor,
    curveChannel,
    openSections,
    setSelectedAssetId,
    setCustomPresetName,
    setActiveHslColor,
    setCurveChannel,
    toggleOriginal,
    updateAdjustments,
    updateAdjustmentValue,
    updateHslValue,
    toggleFlip,
    toggleSection,
    handleResetAll,
    handleCopy,
    handlePaste,
    handleSelectPreset,
    handleSetIntensity,
    handleSaveCustomPreset,
    handleExportPresets,
    handleImportPresets,
  };
}
