import { useCallback, useEffect, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { normalizeAdjustments } from "@/lib/adjustments";
import { useEditorStore } from "@/stores/editorStore";
import { useAssetStore } from "@/stores/assetStore";
import type { HistogramData } from "./histogram";
import { rgbToHue } from "./colorUtils";
import { useEditorHistory } from "./useEditorHistory";
import { useEditorAdjustments } from "./useEditorAdjustments";
import { useEditorColorGrading } from "./useEditorColorGrading";
import { useEditorFilmProfile } from "./useEditorFilmProfile";

export function useEditorState() {
  const assets = useAssetStore((state) => state.assets);

  const {
    selectedAssetId,
    showOriginal,
    activeToolPanelId,
    mobilePanelExpanded,
    curveChannel,
    openSections,
    previewHistogram,
    autoPerspectiveRequestId,
    autoPerspectiveMode,
    selectedLocalAdjustmentId,
    setSelectedAssetId,
    setShowOriginal,
    setActiveToolPanelId,
    setMobilePanelExpanded,
    setCurveChannel,
    setSelectedLocalAdjustmentId,
    toggleOriginal,
    toggleSection,
    setPreviewHistogram,
    setPointColorPicking,
    setPointColorPickTarget,
    requestAutoPerspective,
  } = useEditorStore(
    useShallow((state) => ({
      selectedAssetId: state.selectedAssetId,
      showOriginal: state.showOriginal,
      activeToolPanelId: state.activeToolPanelId,
      mobilePanelExpanded: state.mobilePanelExpanded,
      curveChannel: state.curveChannel,
      openSections: state.openSections,
      previewHistogram: state.previewHistogram,
      autoPerspectiveRequestId: state.autoPerspectiveRequestId,
      autoPerspectiveMode: state.autoPerspectiveMode,
      selectedLocalAdjustmentId: state.selectedLocalAdjustmentId,
      setSelectedAssetId: state.setSelectedAssetId,
      setShowOriginal: state.setShowOriginal,
      setActiveToolPanelId: state.setActiveToolPanelId,
      setMobilePanelExpanded: state.setMobilePanelExpanded,
      setCurveChannel: state.setCurveChannel,
      setSelectedLocalAdjustmentId: state.setSelectedLocalAdjustmentId,
      toggleOriginal: state.toggleOriginal,
      toggleSection: state.toggleSection,
      setPreviewHistogram: state.setPreviewHistogram,
      setPointColorPicking: state.setPointColorPicking,
      setPointColorPickTarget: state.setPointColorPickTarget,
      requestAutoPerspective: state.requestAutoPerspective,
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
    previewAdjustmentPatch,
    commitAdjustmentPatch,
    toggleFlip,
    previewPointCurve,
    commitPointCurve,
  } = useEditorAdjustments(selectedAsset, history);

  const {
    activeHslColor,
    pointColorPicking,
    pointColorPickTarget,
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

  const commitLocalMaskColorSample = useCallback(
    (sample: { red: number; green: number; blue: number }) => {
      const assetId = selectedAsset?.id;
      if (!assetId) {
        setPointColorPicking(false);
        setPointColorPickTarget("hsl");
        return null;
      }

      const liveAsset =
        useAssetStore.getState().assets.find((asset) => asset.id === assetId) ?? selectedAsset;
      if (!liveAsset) {
        setPointColorPicking(false);
        setPointColorPickTarget("hsl");
        return null;
      }

      const currentAdjustments = normalizeAdjustments(liveAsset.adjustments);
      const localAdjustments = currentAdjustments.localAdjustments ?? [];
      const targetLocalId = selectedLocalAdjustmentId ?? localAdjustments[0]?.id ?? null;
      const targetLocal = targetLocalId
        ? localAdjustments.find((item) => item.id === targetLocalId) ?? null
        : null;
      if (!targetLocal || !targetLocalId) {
        setPointColorPicking(false);
        setPointColorPickTarget("hsl");
        return null;
      }

      const hue = rgbToHue(sample.red, sample.green, sample.blue);
      const r = sample.red / 255;
      const g = sample.green / 255;
      const b = sample.blue / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const saturation = max <= 1e-6 ? 0 : (max - min) / max;

      const currentHueRange = targetLocal.mask.hueRange ?? 180;
      const currentSatMin = targetLocal.mask.satMin ?? 0;
      const currentSatFeather = targetLocal.mask.satFeather ?? 0;
      const nextHueRange = currentHueRange >= 179.5 ? 35 : currentHueRange;
      const nextSatMin = currentSatMin <= 1e-4 ? Math.min(0.95, saturation * 0.5) : currentSatMin;
      const nextSatFeather = currentSatFeather <= 1e-4 ? 0.15 : currentSatFeather;

      const nextLocalAdjustments = localAdjustments.map((item) =>
        item.id === targetLocalId
          ? {
              ...item,
              mask: {
                ...item.mask,
                hueCenter: hue,
                hueRange: nextHueRange,
                satMin: nextSatMin,
                satFeather: nextSatFeather,
              },
            }
          : item
      );

      const committed = commitAdjustmentPatch(`local:${targetLocalId}:pickColor`, {
        localAdjustments: nextLocalAdjustments,
      });

      setSelectedLocalAdjustmentId(targetLocalId);
      setPointColorPicking(false);
      setPointColorPickTarget("hsl");

      return committed
        ? {
            maskId: targetLocalId,
            hue,
            saturation,
          }
        : null;
    },
    [
      commitAdjustmentPatch,
      selectedAsset,
      selectedLocalAdjustmentId,
      setPointColorPickTarget,
      setPointColorPicking,
      setSelectedLocalAdjustmentId,
    ]
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
    pointColorPickTarget,
    lastPointColorSample,
    autoPerspectiveRequestId,
    autoPerspectiveMode,
    selectedLocalAdjustmentId,
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
    setSelectedLocalAdjustmentId,
    requestAutoPerspective,
    toggleOriginal,
    toggleSection,
    updateAdjustments,
    previewAdjustmentValue,
    updateAdjustmentValue,
    previewCropAdjustments,
    commitCropAdjustments,
    previewAdjustmentPatch,
    commitAdjustmentPatch,
    previewPointCurve,
    commitPointCurve,
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
    commitLocalMaskColorSample,
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
