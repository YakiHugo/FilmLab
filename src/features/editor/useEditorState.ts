import { useCallback, useEffect, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { createDefaultAdjustments, normalizeAdjustments } from "@/lib/adjustments";
import { createDefaultLayerMask, createDefaultLayerMaskData } from "@/lib/editorLayerMasks";
import {
  createEditorLayerId,
  ensureAssetLayers,
  moveLayerToIndex,
  resolveBaseAdjustmentsFromLayers,
  resolveLayerAdjustments,
} from "@/lib/editorLayers";
import { useEditorStore } from "@/stores/editorStore";
import { useAssetStore } from "@/stores/assetStore";
import type {
  AssetUpdate,
  EditorLayer,
  EditorLayerBlendMode,
  EditorLayerMask,
  EditorLayerMaskData,
  EditorLayerMaskMode,
} from "@/types";
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
    viewportScale,
    activeToolPanelId,
    mobilePanelExpanded,
    curveChannel,
    openSections,
    previewHistogram,
    autoPerspectiveRequestId,
    autoPerspectiveMode,
    selectedLocalAdjustmentId,
    bypassedPanels,
    setSelectedAssetId,
    setSelectedLayerId,
    setShowOriginal,
    setViewportScale,
    setActiveToolPanelId,
    setMobilePanelExpanded,
    setCurveChannel,
    setSelectedLocalAdjustmentId,
    toggleOriginal,
    toggleSection,
    toggleBypassPanel,
    isPanelBypassed,
    setPreviewHistogram,
    setPointColorPicking,
    setPointColorPickTarget,
    requestAutoPerspective,
  } = useEditorStore(
    useShallow((state) => ({
      selectedAssetId: state.selectedAssetId,
      selectedLayerId: state.selectedLayerId,
      showOriginal: state.showOriginal,
      viewportScale: state.viewportScale,
      activeToolPanelId: state.activeToolPanelId,
      mobilePanelExpanded: state.mobilePanelExpanded,
      curveChannel: state.curveChannel,
      openSections: state.openSections,
      previewHistogram: state.previewHistogram,
      autoPerspectiveRequestId: state.autoPerspectiveRequestId,
      autoPerspectiveMode: state.autoPerspectiveMode,
      selectedLocalAdjustmentId: state.selectedLocalAdjustmentId,
      bypassedPanels: state.bypassedPanels,
      setSelectedAssetId: state.setSelectedAssetId,
      setSelectedLayerId: state.setSelectedLayerId,
      setShowOriginal: state.setShowOriginal,
      setViewportScale: state.setViewportScale,
      setActiveToolPanelId: state.setActiveToolPanelId,
      setMobilePanelExpanded: state.setMobilePanelExpanded,
      setCurveChannel: state.setCurveChannel,
      setSelectedLocalAdjustmentId: state.setSelectedLocalAdjustmentId,
      toggleOriginal: state.toggleOriginal,
      toggleSection: state.toggleSection,
      toggleBypassPanel: state.toggleBypassPanel,
      isPanelBypassed: state.isPanelBypassed,
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

  // Apply bypass logic to preview adjustments
  const bypassedPreviewAdjustments = useMemo(() => {
    if (!resolvedPreviewAdjustments) {
      return null;
    }
    const defaults = createDefaultAdjustments();
    let result = { ...resolvedPreviewAdjustments };

    // Bypass Basic panel
    if (bypassedPanels.has("basic")) {
      result = {
        ...result,
        exposure: defaults.exposure,
        contrast: defaults.contrast,
        highlights: defaults.highlights,
        shadows: defaults.shadows,
        whites: defaults.whites,
        blacks: defaults.blacks,
        temperature: defaults.temperature,
        tint: defaults.tint,
        vibrance: defaults.vibrance,
        saturation: defaults.saturation,
      };
    }

    // Bypass Effects panel
    if (bypassedPanels.has("effects")) {
      result = {
        ...result,
        texture: defaults.texture,
        clarity: defaults.clarity,
        dehaze: defaults.dehaze,
        grain: defaults.grain,
        grainSize: defaults.grainSize,
        grainRoughness: defaults.grainRoughness,
        vignette: defaults.vignette,
        glowIntensity: defaults.glowIntensity,
        glowMidtoneFocus: defaults.glowMidtoneFocus,
        glowBias: defaults.glowBias,
        glowRadius: defaults.glowRadius,
      };
    }

    // Bypass Detail panel
    if (bypassedPanels.has("detail")) {
      result = {
        ...result,
        sharpening: defaults.sharpening,
        sharpenRadius: defaults.sharpenRadius,
        sharpenDetail: defaults.sharpenDetail,
        masking: defaults.masking,
        noiseReduction: defaults.noiseReduction,
        colorNoiseReduction: defaults.colorNoiseReduction,
      };
    }

    // Bypass Crop panel
    if (bypassedPanels.has("crop")) {
      result = {
        ...result,
        rotate: defaults.rotate,
        rightAngleRotation: defaults.rightAngleRotation,
        perspectiveEnabled: defaults.perspectiveEnabled,
        perspectiveHorizontal: defaults.perspectiveHorizontal,
        perspectiveVertical: defaults.perspectiveVertical,
        horizontal: defaults.horizontal,
        vertical: defaults.vertical,
        scale: defaults.scale,
        flipHorizontal: defaults.flipHorizontal,
        flipVertical: defaults.flipVertical,
        aspectRatio: defaults.aspectRatio,
        customAspectRatio: defaults.customAspectRatio,
      };
    }

    return result;
  }, [resolvedPreviewAdjustments, bypassedPanels]);

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

  const addTextureLayer = useCallback(
    (textureAssetId: string) => {
      if (!selectedAsset) {
        return;
      }
      const textureAsset = assets.find((asset) => asset.id === textureAssetId);
      if (!textureAsset) {
        return;
      }
      const textureLayer: EditorLayer = {
        id: createEditorLayerId("texture"),
        name: textureAsset.name,
        type: "texture",
        visible: true,
        opacity: 100,
        blendMode: "normal",
        textureAssetId,
        adjustments: createDefaultAdjustments(),
      };
      addLayer(selectedAsset.id, textureLayer);
      setSelectedLayerId(textureLayer.id);
    },
    [addLayer, assets, selectedAsset, setSelectedLayerId]
  );

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
      const nextOpacity = Math.max(0, Math.min(100, Math.round(opacity)));
      updateLayer(selectedAsset.id, layerId, { opacity: nextOpacity });
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

  const setLayerMask = useCallback(
    (layerId: string, mask: EditorLayerMask | undefined) => {
      if (!selectedAsset) {
        return;
      }
      updateLayer(selectedAsset.id, layerId, { mask });
    },
    [selectedAsset, updateLayer]
  );

  const setLayerMaskMode = useCallback(
    (layerId: string, mode: EditorLayerMaskMode) => {
      if (!selectedAsset) {
        return;
      }
      const layer = layers.find((item) => item.id === layerId);
      if (!layer) {
        return;
      }

      const currentMask = layer.mask;
      const nextMask: EditorLayerMask =
        currentMask?.mode === mode
          ? {
              mode,
              inverted: currentMask.inverted,
              data: currentMask.data ?? createDefaultLayerMaskData(mode),
            }
          : createDefaultLayerMask(mode);
      updateLayer(selectedAsset.id, layerId, { mask: nextMask });
    },
    [layers, selectedAsset, updateLayer]
  );

  const updateLayerMaskData = useCallback(
    (layerId: string, data: EditorLayerMaskData) => {
      if (!selectedAsset) {
        return;
      }
      const layer = layers.find((item) => item.id === layerId);
      if (!layer?.mask) {
        return;
      }
      updateLayer(selectedAsset.id, layerId, {
        mask: {
          ...layer.mask,
          data,
        },
      });
    },
    [layers, selectedAsset, updateLayer]
  );

  const invertLayerMask = useCallback(
    (layerId: string) => {
      if (!selectedAsset) {
        return;
      }
      const layer = layers.find((item) => item.id === layerId);
      if (!layer?.mask) {
        return;
      }
      updateLayer(selectedAsset.id, layerId, {
        mask: {
          ...layer.mask,
          inverted: !layer.mask.inverted,
        },
      });
    },
    [layers, selectedAsset, updateLayer]
  );

  const clearLayerMask = useCallback(
    (layerId: string) => {
      if (!selectedAsset) {
        return;
      }
      updateLayer(selectedAsset.id, layerId, { mask: undefined });
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
    previewAdjustments: bypassedPreviewAdjustments,
    previewFilmProfile,
    previewHistogram,
    presetLabel,
    filmProfileLabel,
    showOriginal,
    viewportScale,
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
    setViewportScale,
    setActiveToolPanelId,
    setMobilePanelExpanded,
    setCustomPresetName,
    setActiveHslColor,
    setCurveChannel,
    setSelectedLocalAdjustmentId,
    addAdjustmentLayer,
    addDuplicateLayer,
    addTextureLayer,
    reorderLayer,
    moveLayer: moveSelectedLayer,
    removeLayer: removeSelectedLayer,
    duplicateLayer: duplicateSelectedLayer,
    mergeLayerDown: mergeSelectedLayerDown,
    flattenLayers: flattenSelectedAssetLayers,
    setLayerVisibility,
    setLayerOpacity,
    setLayerBlendMode,
    setLayerMask,
    setLayerMaskMode,
    updateLayerMaskData,
    invertLayerMask,
    clearLayerMask,
    requestAutoPerspective,
    toggleOriginal,
    toggleSection,
    toggleBypassPanel,
    isPanelBypassed,
    bypassedPanels,
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
