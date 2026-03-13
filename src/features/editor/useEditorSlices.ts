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
import { useAssetStore } from "@/stores/assetStore";
import { useEditorStore } from "@/stores/editorStore";
import type {
  AssetUpdate,
  EditorLayer,
  EditorLayerBlendMode,
  EditorLayerMask,
  EditorLayerMaskData,
  EditorLayerMaskMode,
} from "@/types";
import { rgbToHue } from "./colorUtils";
import type { HistogramData } from "./histogram";
import { useEditorAdjustments } from "./useEditorAdjustments";
import { useEditorColorGrading } from "./useEditorColorGrading";
import { useEditorFilmProfile } from "./useEditorFilmProfile";
import { useEditorHistory } from "./useEditorHistory";

interface EditorSelectionModel {
  assets: ReturnType<typeof useAssetStore.getState>["assets"];
  layers: EditorLayer[];
  selectedAsset: ReturnType<typeof useAssetStore.getState>["assets"][number] | null;
  selectedAssetForEditing: ReturnType<typeof useAssetStore.getState>["assets"][number] | null;
  selectedAssetId: string | null;
  selectedLayer: EditorLayer | null;
  selectedLayerId: string | null;
  setSelectedAssetId: (assetId: string | null) => void;
  setSelectedLayerId: (layerId: string | null) => void;
}

const useEditorSelectionModel = (): EditorSelectionModel => {
  const { assets } = useAssetStore(
    useShallow((state) => ({
      assets: state.assets,
    }))
  );
  const {
    selectedAssetId,
    selectedLayerId,
    setSelectedAssetId,
    setSelectedLayerId,
  } = useEditorStore(
    useShallow((state) => ({
      selectedAssetId: state.selectedAssetId,
      selectedLayerId: state.selectedLayerId,
      setSelectedAssetId: state.setSelectedAssetId,
      setSelectedLayerId: state.setSelectedLayerId,
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
    if (!selectedAsset || layers.length === 0) {
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

  return {
    assets,
    layers,
    selectedAsset,
    selectedAssetForEditing,
    selectedAssetId,
    selectedLayer,
    selectedLayerId,
    setSelectedAssetId,
    setSelectedLayerId,
  };
};

const useEditorHistoryActions = (
  selectedAssetForEditing: EditorSelectionModel["selectedAssetForEditing"],
  layers: EditorLayer[],
  selectedAsset: EditorSelectionModel["selectedAsset"],
  selectedLayer: EditorLayer | null
) => {
  const history = useEditorHistory(selectedAssetForEditing);

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

  return useMemo(
    () => ({
      applyEditorPatch: (patch: AssetUpdate) => history.applyEditorPatch(normalizeLayerAwarePatch(patch)),
      commitEditorPatch: (historyKey: string, patch: AssetUpdate) =>
        history.commitEditorPatch(historyKey, normalizeLayerAwarePatch(patch)),
      stageEditorPatch: (historyKey: string, patch: AssetUpdate) =>
        history.stageEditorPatch(historyKey, normalizeLayerAwarePatch(patch)),
      history,
    }),
    [history, normalizeLayerAwarePatch]
  );
};

export function useEditorSelectionState() {
  const selection = useEditorSelectionModel();
  return {
    assets: selection.assets,
    layers: selection.layers,
    selectedAsset: selection.selectedAsset,
    selectedAssetId: selection.selectedAssetId,
    selectedLayer: selection.selectedLayer,
    selectedLayerId: selection.selectedLayerId,
    setSelectedAssetId: selection.setSelectedAssetId,
    setSelectedLayerId: selection.setSelectedLayerId,
  };
}

export function useEditorViewState() {
  return useEditorStore(
    useShallow((state) => ({
      activeToolPanelId: state.activeToolPanelId,
      autoPerspectiveMode: state.autoPerspectiveMode,
      autoPerspectiveRequestId: state.autoPerspectiveRequestId,
      bypassedPanels: state.bypassedPanels,
      cropGuideMode: state.cropGuideMode,
      cropGuideRotation: state.cropGuideRotation,
      curveChannel: state.curveChannel,
      cycleCropGuideMode: state.cycleCropGuideMode,
      isPanelBypassed: state.isPanelBypassed,
      mobilePanelExpanded: state.mobilePanelExpanded,
      openSections: state.openSections,
      pointColorPickTarget: state.pointColorPickTarget,
      pointColorPicking: state.pointColorPicking,
      previewHistogram: state.previewHistogram,
      previewWaveform: state.previewWaveform,
      requestAutoPerspective: state.requestAutoPerspective,
      selectedLocalAdjustmentId: state.selectedLocalAdjustmentId,
      setActiveToolPanelId: state.setActiveToolPanelId,
      setCropGuideMode: state.setCropGuideMode,
      setCropGuideRotation: state.setCropGuideRotation,
      setCurveChannel: state.setCurveChannel,
      setMobilePanelExpanded: state.setMobilePanelExpanded,
      setPreviewHistogram: state.setPreviewHistogram,
      setPreviewWaveform: state.setPreviewWaveform,
      setSelectedLocalAdjustmentId: state.setSelectedLocalAdjustmentId,
      setShowOriginal: state.setShowOriginal,
      setViewportScale: state.setViewportScale,
      rotateCropGuide: state.rotateCropGuide,
      showOriginal: state.showOriginal,
      toggleBypassPanel: state.toggleBypassPanel,
      toggleOriginal: state.toggleOriginal,
      toggleSection: state.toggleSection,
      viewportScale: state.viewportScale,
    }))
  );
}

export function useEditorHistoryState() {
  const { layers, selectedAsset, selectedAssetForEditing, selectedLayer } = useEditorSelectionModel();
  const { history } = useEditorHistoryActions(
    selectedAssetForEditing,
    layers,
    selectedAsset,
    selectedLayer
  );
  return {
    canRedo: history.canRedo,
    canUndo: history.canUndo,
    handleRedo: history.handleRedo,
    handleUndo: history.handleUndo,
  };
}

export function useEditorAdjustmentState() {
  const { bypassedPanels } = useEditorViewState();
  const { layers, selectedAsset, selectedAssetForEditing, selectedLayer } = useEditorSelectionModel();
  const { history } = useEditorHistoryActions(
    selectedAssetForEditing,
    layers,
    selectedAsset,
    selectedLayer
  );

  const adjustments = useMemo(() => {
    if (!selectedAssetForEditing) {
      return null;
    }
    return normalizeAdjustments(selectedAssetForEditing.adjustments);
  }, [selectedAssetForEditing]);

  const {
    builtInFilmProfiles,
    copiedAdjustments,
    customPresetName,
    customPresets,
    filmProfileLabel,
    presetLabel,
    previewAdjustments: resolvedPreviewAdjustments,
    previewFilmProfile,
  } = useEditorFilmProfile(selectedAssetForEditing, adjustments, history);

  const previewAdjustments = useMemo(() => {
    if (!resolvedPreviewAdjustments) {
      return null;
    }
    const defaults = createDefaultAdjustments();
    let result = { ...resolvedPreviewAdjustments };

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
  }, [bypassedPanels, resolvedPreviewAdjustments]);

  return {
    adjustments,
    builtInFilmProfiles,
    copiedAdjustments,
    customPresetName,
    customPresets,
    filmProfileLabel,
    presetLabel,
    previewAdjustments,
    previewFilmProfile,
  };
}

export function useEditorAdjustmentActions() {
  const {
    layers,
    selectedAsset,
    selectedAssetForEditing,
    selectedLayer,
  } = useEditorSelectionModel();
  const viewState = useEditorViewState();
  const { applyEditorPatch, commitEditorPatch, stageEditorPatch } = useEditorHistoryActions(
    selectedAssetForEditing,
    layers,
    selectedAsset,
    selectedLayer
  );

  const adjustmentActions = useEditorAdjustments(selectedAssetForEditing, {
    applyEditorPatch,
    commitEditorPatch,
    stageEditorPatch,
  });

  const { commitPointColorSample, cancelPointColorPick } = useEditorColorGrading(
    selectedAssetForEditing,
    {
      applyEditorPatch,
      commitEditorPatch,
      stageEditorPatch,
    }
  );

  const commitLocalMaskColorSample = useCallback(
    (sample: { red: number; green: number; blue: number }) => {
      if (!selectedAssetForEditing) {
        useEditorStore.getState().setPointColorPicking(false);
        useEditorStore.getState().setPointColorPickTarget("hsl");
        return null;
      }

      const currentAdjustments = normalizeAdjustments(selectedAssetForEditing.adjustments);
      const localAdjustments = currentAdjustments.localAdjustments ?? [];
      const targetLocalId =
        viewState.selectedLocalAdjustmentId ?? localAdjustments[0]?.id ?? null;
      const targetLocal = targetLocalId
        ? localAdjustments.find((item) => item.id === targetLocalId) ?? null
        : null;
      if (!targetLocal || !targetLocalId) {
        useEditorStore.getState().setPointColorPicking(false);
        useEditorStore.getState().setPointColorPickTarget("hsl");
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
      const nextLocalAdjustments = localAdjustments.map((item) =>
        item.id === targetLocalId
          ? {
              ...item,
              mask: {
                ...item.mask,
                hueCenter: hue,
                hueRange: currentHueRange >= 179.5 ? 35 : currentHueRange,
                satMin: currentSatMin <= 1e-4 ? Math.min(0.95, saturation * 0.5) : currentSatMin,
                satFeather: currentSatFeather <= 1e-4 ? 0.15 : currentSatFeather,
              },
            }
          : item
      );

      const committed = adjustmentActions.commitAdjustmentPatch(`local:${targetLocalId}:pickColor`, {
        localAdjustments: nextLocalAdjustments,
      });

      viewState.setSelectedLocalAdjustmentId(targetLocalId);
      useEditorStore.getState().setPointColorPicking(false);
      useEditorStore.getState().setPointColorPickTarget("hsl");

      return committed
        ? {
            hue,
            maskId: targetLocalId,
            saturation,
          }
        : null;
    },
    [
      adjustmentActions,
      selectedAssetForEditing,
      viewState,
    ]
  );

  return {
    ...adjustmentActions,
    cancelPointColorPick,
    commitLocalMaskColorSample,
    commitPointColorSample,
    setPreviewHistogram: viewState.setPreviewHistogram,
  };
}

export function useEditorColorGradingState() {
  const { layers, selectedAsset, selectedAssetForEditing, selectedLayer } = useEditorSelectionModel();
  const { applyEditorPatch, commitEditorPatch, stageEditorPatch } = useEditorHistoryActions(
    selectedAssetForEditing,
    layers,
    selectedAsset,
    selectedLayer
  );
  const colorGrading = useEditorColorGrading(selectedAssetForEditing, {
    applyEditorPatch,
    commitEditorPatch,
    stageEditorPatch,
  });
  return {
    activeHslColor: colorGrading.activeHslColor,
    lastPointColorSample: colorGrading.lastPointColorSample,
    pointColorPickTarget: colorGrading.pointColorPickTarget,
    pointColorPicking: colorGrading.pointColorPicking,
  };
}

export function useEditorColorGradingActions() {
  const { layers, selectedAsset, selectedAssetForEditing, selectedLayer } = useEditorSelectionModel();
  const { applyEditorPatch, commitEditorPatch, stageEditorPatch } = useEditorHistoryActions(
    selectedAssetForEditing,
    layers,
    selectedAsset,
    selectedLayer
  );
  const colorGrading = useEditorColorGrading(selectedAssetForEditing, {
    applyEditorPatch,
    commitEditorPatch,
    stageEditorPatch,
  });
  return {
    cancelPointColorPick: colorGrading.cancelPointColorPick,
    commitPointColorSample: colorGrading.commitPointColorSample,
    previewColorGradingValue: colorGrading.previewColorGradingValue,
    previewColorGradingZone: colorGrading.previewColorGradingZone,
    previewHslValue: colorGrading.previewHslValue,
    resetColorGrading: colorGrading.resetColorGrading,
    setActiveHslColor: colorGrading.setActiveHslColor,
    startPointColorPick: colorGrading.startPointColorPick,
    updateColorGradingValue: colorGrading.updateColorGradingValue,
    updateColorGradingZone: colorGrading.updateColorGradingZone,
    updateHslValue: colorGrading.updateHslValue,
  };
}

export function useEditorPresetActions() {
  const { layers, selectedAsset, selectedAssetForEditing, selectedLayer } = useEditorSelectionModel();
  const { applyEditorPatch, commitEditorPatch, stageEditorPatch } = useEditorHistoryActions(
    selectedAssetForEditing,
    layers,
    selectedAsset,
    selectedLayer
  );
  const adjustments = useMemo(() => {
    if (!selectedAssetForEditing) {
      return null;
    }
    return normalizeAdjustments(selectedAssetForEditing.adjustments);
  }, [selectedAssetForEditing]);
  const filmProfile = useEditorFilmProfile(selectedAssetForEditing, adjustments, {
    applyEditorPatch,
    commitEditorPatch,
    stageEditorPatch,
  });
  return {
    handleCopy: filmProfile.handleCopy,
    handleExportFilmProfile: filmProfile.handleExportFilmProfile,
    handleExportPresets: filmProfile.handleExportPresets,
    handleImportFilmProfile: filmProfile.handleImportFilmProfile,
    handleImportPresets: filmProfile.handleImportPresets,
    handlePaste: filmProfile.handlePaste,
    handleResetAll: filmProfile.handleResetAll,
    handleResetFilmOverrides: filmProfile.handleResetFilmOverrides,
    handleSaveCustomPreset: filmProfile.handleSaveCustomPreset,
    handleSelectFilmProfile: filmProfile.handleSelectFilmProfile,
    handleSelectPreset: filmProfile.handleSelectPreset,
    handleSetFilmModuleAmount: filmProfile.handleSetFilmModuleAmount,
    handleSetFilmModuleParam: filmProfile.handleSetFilmModuleParam,
    handleSetFilmModuleRgbMix: filmProfile.handleSetFilmModuleRgbMix,
    handleSetIntensity: filmProfile.handleSetIntensity,
    handleToggleFilmModule: filmProfile.handleToggleFilmModule,
    setCustomPresetName: filmProfile.setCustomPresetName,
  };
}

export function useEditorLayerActions() {
  const {
    addLayer,
    assets,
    duplicateLayer,
    flattenLayers,
    mergeLayerDown,
    moveLayer,
    removeLayer,
    selectedAsset,
    selectedLayer,
    setSelectedLayerId,
    updateAsset,
    updateLayer,
    layers,
  } = {
    ...useAssetStore(
      useShallow((state) => ({
        addLayer: state.addLayer,
        assets: state.assets,
        duplicateLayer: state.duplicateLayer,
        flattenLayers: state.flattenLayers,
        mergeLayerDown: state.mergeLayerDown,
        moveLayer: state.moveLayer,
        removeLayer: state.removeLayer,
        updateAsset: state.updateAsset,
        updateLayer: state.updateLayer,
      }))
    ),
    ...useEditorSelectionModel(),
  };

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
      updateLayer(selectedAsset.id, layerId, { opacity: Math.max(0, Math.min(100, Math.round(opacity))) });
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

  return {
    addAdjustmentLayer,
    addDuplicateLayer,
    addTextureLayer,
    clearLayerMask,
    duplicateLayer: (layerId: string) => selectedAsset && duplicateLayer(selectedAsset.id, layerId),
    flattenLayers: () => selectedAsset && flattenLayers(selectedAsset.id),
    invertLayerMask,
    mergeLayerDown: (layerId: string) => selectedAsset && mergeLayerDown(selectedAsset.id, layerId),
    moveLayer: (layerId: string, direction: "up" | "down") =>
      selectedAsset && moveLayer(selectedAsset.id, layerId, direction),
    removeLayer: (layerId: string) => selectedAsset && removeLayer(selectedAsset.id, layerId),
    reorderLayer,
    setLayerBlendMode,
    setLayerMask,
    setLayerMaskMode,
    setLayerOpacity,
    setLayerVisibility,
    updateLayerMaskData,
  };
}

export function useEditorPresetState() {
  const adjustmentState = useEditorAdjustmentState();
  return {
    builtInFilmProfiles: adjustmentState.builtInFilmProfiles,
    copiedAdjustments: adjustmentState.copiedAdjustments,
    customPresetName: adjustmentState.customPresetName,
    customPresets: adjustmentState.customPresets,
    filmProfileLabel: adjustmentState.filmProfileLabel,
    presetLabel: adjustmentState.presetLabel,
    previewAdjustments: adjustmentState.previewAdjustments,
    previewFilmProfile: adjustmentState.previewFilmProfile,
  };
}

export const handlePreviewHistogramChange = (histogram: HistogramData | null) => {
  useEditorStore.getState().setPreviewHistogram(histogram);
};
