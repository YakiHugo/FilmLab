import { useCallback, useEffect, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { normalizeAdjustments } from "@/lib/adjustments";
import { useEditorStore } from "@/stores/editorStore";
import { useProjectStore } from "@/stores/projectStore";
import type { HistogramData } from "./histogram";
import { useEditorHistory } from "./useEditorHistory";
import { useEditorAdjustments } from "./useEditorAdjustments";
import { useEditorColorGrading } from "./useEditorColorGrading";
import { useEditorFilmProfile } from "./useEditorFilmProfile";

export function useEditorState() {
  const assets = useProjectStore((state) => state.assets);

  const {
    selectedAssetId,
    showOriginal,
    activeToolPanelId,
    mobilePanelExpanded,
    curveChannel,
    openSections,
    previewHistogram,
    setSelectedAssetId,
    setShowOriginal,
    setActiveToolPanelId,
    setMobilePanelExpanded,
    setCurveChannel,
    toggleOriginal,
    toggleSection,
    setPreviewHistogram,
  } = useEditorStore(
    useShallow((state) => ({
      selectedAssetId: state.selectedAssetId,
      showOriginal: state.showOriginal,
      activeToolPanelId: state.activeToolPanelId,
      mobilePanelExpanded: state.mobilePanelExpanded,
      curveChannel: state.curveChannel,
      openSections: state.openSections,
      previewHistogram: state.previewHistogram,
      setSelectedAssetId: state.setSelectedAssetId,
      setShowOriginal: state.setShowOriginal,
      setActiveToolPanelId: state.setActiveToolPanelId,
      setMobilePanelExpanded: state.setMobilePanelExpanded,
      setCurveChannel: state.setCurveChannel,
      toggleOriginal: state.toggleOriginal,
      toggleSection: state.toggleSection,
      setPreviewHistogram: state.setPreviewHistogram,
    }))
  );

  const selectedAsset = useMemo(() => {
    if (assets.length === 0) {
      return null;
    }
    return assets.find((asset) => asset.id === selectedAssetId) ?? assets[0] ?? null;
  }, [assets, selectedAssetId]);

  useEffect(() => {
    if (assets.length === 0) {
      if (selectedAssetId !== null) {
        setSelectedAssetId(null);
      }
      return;
    }
    const hasValidSelection =
      typeof selectedAssetId === "string" && assets.some((asset) => asset.id === selectedAssetId);
    if (hasValidSelection) {
      return;
    }
    const fallbackId = assets[0]?.id ?? null;
    if (fallbackId && fallbackId !== selectedAssetId) {
      setSelectedAssetId(fallbackId);
    }
  }, [assets, selectedAssetId, setSelectedAssetId]);

  const adjustments = useMemo(() => {
    if (!selectedAsset) {
      return null;
    }
    return normalizeAdjustments(selectedAsset.adjustments);
  }, [selectedAsset]);

  // --- Compose extracted hooks ---

  const history = useEditorHistory(selectedAsset);

  const {
    updateAdjustments,
    previewAdjustmentValue,
    updateAdjustmentValue,
    previewCropAdjustments,
    commitCropAdjustments,
    toggleFlip,
  } = useEditorAdjustments(selectedAsset, history);

  const {
    activeHslColor,
    pointColorPicking,
    lastPointColorSample,
    setActiveHslColor,
    previewHslValue,
    updateHslValue,
    previewColorGradingZone,
    updateColorGradingZone,
    previewColorGradingValue,
    updateColorGradingValue,
    resetColorGrading,
    startPointColorPick,
    cancelPointColorPick,
    commitPointColorSample,
  } = useEditorColorGrading(selectedAsset, history);

  const {
    allPresets: _allPresets,
    builtInFilmProfiles,
    previewAdjustments: resolvedPreviewAdjustments,
    previewFilmProfile,
    presetLabel,
    filmProfileLabel,
    copiedAdjustments,
    customPresetName,
    customPresets,
    setCustomPresetName,
    handleSetFilmModuleAmount,
    handleToggleFilmModule,
    handleSetFilmModuleParam,
    handleSetFilmModuleRgbMix,
    handleResetFilmOverrides,
    handleResetAll,
    handleCopy,
    handlePaste,
    handleSelectPreset,
    handleSetIntensity,
    handleSelectFilmProfile,
    handleSaveCustomPreset,
    handleExportPresets,
    handleExportFilmProfile,
    handleImportFilmProfile,
    handleImportPresets,
  } = useEditorFilmProfile(selectedAsset, adjustments, history);

  const handlePreviewHistogramChange = useCallback(
    (histogram: HistogramData | null) => {
      setPreviewHistogram(histogram);
    },
    [setPreviewHistogram]
  );

  return {
    selectedAssetId,
    selectedAsset,
    adjustments,
    previewAdjustments: resolvedPreviewAdjustments,
    previewFilmProfile,
    previewHistogram,
    presetLabel,
    filmProfileLabel,
    showOriginal,
    activeToolPanelId,
    mobilePanelExpanded,
    copiedAdjustments,
    customPresetName,
    customPresets,
    builtInFilmProfiles,
    activeHslColor,
    pointColorPicking,
    lastPointColorSample,
    curveChannel,
    openSections,
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    setSelectedAssetId,
    setShowOriginal,
    setActiveToolPanelId,
    setMobilePanelExpanded,
    setCustomPresetName,
    setActiveHslColor,
    setCurveChannel,
    toggleOriginal,
    toggleSection,
    updateAdjustments,
    previewAdjustmentValue,
    updateAdjustmentValue,
    previewCropAdjustments,
    commitCropAdjustments,
    previewHslValue,
    updateHslValue,
    previewColorGradingZone,
    updateColorGradingZone,
    previewColorGradingValue,
    updateColorGradingValue,
    resetColorGrading,
    startPointColorPick,
    cancelPointColorPick,
    commitPointColorSample,
    toggleFlip,
    handlePreviewHistogramChange,
    handleSetFilmModuleAmount,
    handleToggleFilmModule,
    handleSetFilmModuleParam,
    handleSetFilmModuleRgbMix,
    handleResetFilmOverrides,
    handleResetAll,
    handleCopy,
    handlePaste,
    handleUndo: history.handleUndo,
    handleRedo: history.handleRedo,
    handleSelectPreset,
    handleSetIntensity,
    handleSelectFilmProfile,
    handleSaveCustomPreset,
    handleExportPresets,
    handleImportPresets,
    handleExportFilmProfile,
    handleImportFilmProfile,
  };
}
