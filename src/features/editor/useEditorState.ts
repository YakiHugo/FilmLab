import { useCallback, useEffect, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { createDefaultAdjustments, normalizeAdjustments } from "@/lib/adjustments";
import {
  createEditorLayerId,
  ensureAssetLayers,
  moveLayerToIndex,
  resolveBaseAdjustmentsFromLayers,
  resolveLayerAdjustments,
} from "@/lib/editorLayers";
import { useEditorStore } from "@/stores/editorStore";
import { useAssetStore } from "@/stores/assetStore";
import type { AssetUpdate, EditorLayer, EditorLayerBlendMode } from "@/types";
import type { HistogramData } from "./histogram";
import { rgbToHue } from "./colorUtils";
import { useEditorHistory } from "./useEditorHistory";
import { useEditorAdjustments } from "./useEditorAdjustments";
import { useEditorColorGrading } from "./useEditorColorGrading";
import { useEditorFilmProfile } from "./useEditorFilmProfile";

export function useEditorState() {
  const {
    assets,
    updateAsset,
    addLayer,
    removeLayer,
    updateLayer,
    moveLayer,
    duplicateLayer,
    mergeLayerDown,
    flattenLayers,
  } = useAssetStore(
    useShallow((state) => ({
      assets: state.assets,
      updateAsset: state.updateAsset,
      addLayer: state.addLayer,
      removeLayer: state.removeLayer,
      updateLayer: state.updateLayer,
      moveLayer: state.moveLayer,
      duplicateLayer: state.duplicateLayer,
      mergeLayerDown: state.mergeLayerDown,
      flattenLayers: state.flattenLayers,
    }))
  );

  const {
    selectedAssetId,
    selectedLayerId,
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
    setSelectedLayerId,
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
      selectedLayerId: state.selectedLayerId,
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
      setSelectedLayerId: state.setSelectedLayerId,
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
    if (assets.length === 0 || !selectedAssetId) {
      return null;
    }
    return assets.find((asset) => asset.id === selectedAssetId) ?? null;
  }, [assets, selectedAssetId]);

  const layers = useMemo(() => {
    if (!selectedAsset) {
      return [];
    }
    return ensureAssetLayers(selectedAsset);
  }, [selectedAsset]);

  useEffect(() => {
    if (!selectedAsset) {
      if (selectedLayerId !== null) {
        setSelectedLayerId(null);
      }
      return;
    }
    if (layers.length === 0) {
      if (selectedLayerId !== null) {
        setSelectedLayerId(null);
      }
      return;
    }
    if (selectedLayerId && layers.some((layer) => layer.id === selectedLayerId)) {
      return;
    }
    setSelectedLayerId(layers[0]!.id);
  }, [layers, selectedAsset, selectedLayerId, setSelectedLayerId]);

  const selectedLayer = useMemo(() => {
    if (layers.length === 0) {
      return null;
    }
    if (selectedLayerId) {
      return layers.find((layer) => layer.id === selectedLayerId) ?? layers[0]!;
    }
    return layers[0]!;
  }, [layers, selectedLayerId]);

  const selectedAssetForEditing = useMemo(() => {
    if (!selectedAsset) {
      return null;
    }
    return {
      ...selectedAsset,
      layers,
      adjustments: resolveLayerAdjustments(selectedLayer, selectedAsset.adjustments),
    };
  }, [layers, selectedAsset, selectedLayer]);

  const normalizeLayerAwarePatch = useCallback(
    (patch: AssetUpdate): AssetUpdate => {
      if (!selectedAsset) {
        return patch;
      }

      if (patch.layers) {
        const nextLayers = ensureAssetLayers({
          id: selectedAsset.id,
          adjustments: patch.adjustments ?? selectedAsset.adjustments,
          layers: patch.layers,
        });
        return {
          ...patch,
          layers: nextLayers,
          adjustments: resolveBaseAdjustmentsFromLayers(nextLayers, patch.adjustments),
        };
      }

      if (patch.adjustments && selectedLayer) {
        const nextLayerAdjustments = normalizeAdjustments(patch.adjustments);
        const nextLayers = layers.map((layer) =>
          layer.id === selectedLayer.id
            ? {
                ...layer,
                adjustments: nextLayerAdjustments,
              }
            : layer
        );

        return {
          ...patch,
          layers: nextLayers,
          adjustments: resolveBaseAdjustmentsFromLayers(nextLayers, selectedAsset.adjustments),
        };
      }

      return patch;
    },
    [layers, selectedAsset, selectedLayer]
  );

  const history = useEditorHistory(selectedAssetForEditing);

  const historyActions = useMemo(
    () => ({
      applyEditorPatch: (patch: AssetUpdate) => history.applyEditorPatch(normalizeLayerAwarePatch(patch)),
      stageEditorPatch: (historyKey: string, patch: AssetUpdate) =>
        history.stageEditorPatch(historyKey, normalizeLayerAwarePatch(patch)),
      commitEditorPatch: (historyKey: string, patch: AssetUpdate) =>
        history.commitEditorPatch(historyKey, normalizeLayerAwarePatch(patch)),
    }),
    [history, normalizeLayerAwarePatch]
  );

  const adjustments = useMemo(() => {
    if (!selectedAssetForEditing) {
      return null;
    }
    return normalizeAdjustments(selectedAssetForEditing.adjustments);
  }, [selectedAssetForEditing]);

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
  } = useEditorAdjustments(selectedAssetForEditing, historyActions);

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
  } = useEditorColorGrading(selectedAssetForEditing, historyActions);

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
  } = useEditorFilmProfile(selectedAssetForEditing, adjustments, historyActions);

  const handlePreviewHistogramChange = useCallback(
    (histogram: HistogramData | null) => {
      setPreviewHistogram(histogram);
    },
    [setPreviewHistogram]
  );

  const reorderLayer = useCallback(
    (layerId: string, toIndex: number) => {
      if (!selectedAsset) {
        return;
      }
      const nextLayers = moveLayerToIndex(layers, layerId, toIndex);
      if (nextLayers === layers) {
        return;
      }
      updateAsset(selectedAsset.id, { layers: nextLayers });
    },
    [layers, selectedAsset, updateAsset]
  );

  const addAdjustmentLayer = useCallback(() => {
    if (!selectedAsset) {
      return;
    }
    const adjustmentLayer: EditorLayer = {
      id: createEditorLayerId("adjustment"),
      name: `Adjustment ${layers.filter((layer) => layer.type === "adjustment").length + 1}`,
      type: "adjustment",
      visible: true,
      opacity: 100,
      blendMode: "normal",
      adjustments: createDefaultAdjustments(),
    };
    addLayer(selectedAsset.id, adjustmentLayer);
    setSelectedLayerId(adjustmentLayer.id);
  }, [addLayer, layers, selectedAsset, setSelectedLayerId]);

  const addDuplicateLayer = useCallback(() => {
    if (!selectedAsset || !selectedLayer) {
      return;
    }
    const duplicated: EditorLayer = {
      ...selectedLayer,
      id: createEditorLayerId("layer"),
      name: `${selectedLayer.name} Copy`,
      type: selectedLayer.type === "base" ? "duplicate" : selectedLayer.type,
    };
    addLayer(selectedAsset.id, duplicated);
    setSelectedLayerId(duplicated.id);
  }, [addLayer, selectedAsset, selectedLayer, setSelectedLayerId]);

  const setLayerVisibility = useCallback(
    (layerId: string, visible: boolean) => {
      if (!selectedAsset) {
        return;
      }
      updateLayer(selectedAsset.id, layerId, { visible });
    },
    [selectedAsset, updateLayer]
  );

  const setLayerOpacity = useCallback(
    (layerId: string, opacity: number) => {
      if (!selectedAsset) {
        return;
      }
      updateLayer(selectedAsset.id, layerId, { opacity });
    },
    [selectedAsset, updateLayer]
  );

  const setLayerBlendMode = useCallback(
    (layerId: string, blendMode: EditorLayerBlendMode) => {
      if (!selectedAsset) {
        return;
      }
      updateLayer(selectedAsset.id, layerId, { blendMode });
    },
    [selectedAsset, updateLayer]
  );

  const moveSelectedLayer = useCallback(
    (layerId: string, direction: "up" | "down") => {
      if (!selectedAsset) {
        return;
      }
      moveLayer(selectedAsset.id, layerId, direction);
    },
    [moveLayer, selectedAsset]
  );

  const removeSelectedLayer = useCallback(
    (layerId: string) => {
      if (!selectedAsset) {
        return;
      }
      removeLayer(selectedAsset.id, layerId);
    },
    [removeLayer, selectedAsset]
  );

  const duplicateSelectedLayer = useCallback(
    (layerId: string) => {
      if (!selectedAsset) {
        return;
      }
      duplicateLayer(selectedAsset.id, layerId);
    },
    [duplicateLayer, selectedAsset]
  );

  const mergeSelectedLayerDown = useCallback(
    (layerId: string) => {
      if (!selectedAsset) {
        return;
      }
      mergeLayerDown(selectedAsset.id, layerId);
    },
    [mergeLayerDown, selectedAsset]
  );

  const flattenSelectedAssetLayers = useCallback(() => {
    if (!selectedAsset) {
      return;
    }
    flattenLayers(selectedAsset.id);
  }, [flattenLayers, selectedAsset]);

  const commitLocalMaskColorSample = useCallback(
    (sample: { red: number; green: number; blue: number }) => {
      if (!selectedAssetForEditing) {
        setPointColorPicking(false);
        setPointColorPickTarget("hsl");
        return null;
      }

      const currentAdjustments = normalizeAdjustments(selectedAssetForEditing.adjustments);
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
      selectedAssetForEditing,
      selectedLocalAdjustmentId,
      setPointColorPickTarget,
      setPointColorPicking,
      setSelectedLocalAdjustmentId,
    ]
  );

  return {
    assets,
    selectedAssetId,
    selectedAsset,
    selectedLayerId,
    selectedLayer,
    layers,
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
    setSelectedLayerId,
    setShowOriginal,
    setActiveToolPanelId,
    setMobilePanelExpanded,
    setCustomPresetName,
    setActiveHslColor,
    setCurveChannel,
    setSelectedLocalAdjustmentId,
    addAdjustmentLayer,
    addDuplicateLayer,
    reorderLayer,
    moveLayer: moveSelectedLayer,
    removeLayer: removeSelectedLayer,
    duplicateLayer: duplicateSelectedLayer,
    mergeLayerDown: mergeSelectedLayerDown,
    flattenLayers: flattenSelectedAssetLayers,
    setLayerVisibility,
    setLayerOpacity,
    setLayerBlendMode,
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
