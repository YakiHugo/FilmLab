import { useCallback, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { presets as basePresets } from "@/data/presets";
import { createDefaultAdjustments } from "@/lib/adjustments";
import { listBuiltInFilmProfiles, normalizeFilmProfile } from "@/lib/film";
import { useEditorStore } from "@/stores/editorStore";
import { useProjectStore } from "@/stores/projectStore";
import type {
  Asset,
  EditingAdjustments,
  FilmModuleId,
  FilmNumericParamKey,
  HslColorKey,
  Preset,
} from "@/types";
import type { HistogramData } from "./histogram";
import {
  buildCustomAdjustments,
  mergePresetsById,
  normalizeImportedPresets,
  resolveAdjustments,
  resolveFilmProfile,
} from "./presetUtils";
import type { NumericAdjustmentKey } from "./types";
import { cloneAdjustments } from "./utils";

export function useEditorState() {
  const { assets, updateAsset } = useProjectStore(
    useShallow((state) => ({
      assets: state.assets,
      updateAsset: state.updateAsset,
    }))
  );

  const {
    selectedAssetId,
    showOriginal,
    copiedAdjustments,
    customPresetName,
    customPresets,
    activeHslColor,
    curveChannel,
    openSections,
    previewHistogram,
    setSelectedAssetId,
    setShowOriginal,
    setCopiedAdjustments,
    setCustomPresetName,
    setCustomPresets,
    setActiveHslColor,
    setCurveChannel,
    toggleOriginal,
    toggleSection,
    setPreviewHistogram,
  } = useEditorStore(
    useShallow((state) => ({
      selectedAssetId: state.selectedAssetId,
      showOriginal: state.showOriginal,
      copiedAdjustments: state.copiedAdjustments,
      customPresetName: state.customPresetName,
      customPresets: state.customPresets,
      activeHslColor: state.activeHslColor,
      curveChannel: state.curveChannel,
      openSections: state.openSections,
      previewHistogram: state.previewHistogram,
      setSelectedAssetId: state.setSelectedAssetId,
      setShowOriginal: state.setShowOriginal,
      setCopiedAdjustments: state.setCopiedAdjustments,
      setCustomPresetName: state.setCustomPresetName,
      setCustomPresets: state.setCustomPresets,
      setActiveHslColor: state.setActiveHslColor,
      setCurveChannel: state.setCurveChannel,
      toggleOriginal: state.toggleOriginal,
      toggleSection: state.toggleSection,
      setPreviewHistogram: state.setPreviewHistogram,
    }))
  );

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
  const builtInFilmProfiles = useMemo(() => listBuiltInFilmProfiles(), []);

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

  const previewFilmProfile = useMemo(() => {
    if (!selectedAsset || !previewAdjustments) {
      return null;
    }
    return resolveFilmProfile(
      previewAdjustments,
      selectedAsset.presetId,
      selectedAsset.filmProfileId,
      selectedAsset.filmProfile,
      selectedAsset.intensity,
      allPresets,
      selectedAsset.filmOverrides
    );
  }, [allPresets, previewAdjustments, selectedAsset]);

  const presetLabel = useMemo(() => {
    if (!selectedAsset?.presetId) {
      return "未指定";
    }
    return (
      allPresets.find((preset) => preset.id === selectedAsset.presetId)?.name ??
      "未指定"
    );
  }, [allPresets, selectedAsset?.presetId]);

  const filmProfileLabel = useMemo(() => {
    if (previewFilmProfile) {
      return previewFilmProfile.name;
    }
    if (selectedAsset?.filmProfileId) {
      return selectedAsset.filmProfileId;
    }
    return "鑷姩";
  }, [previewFilmProfile, selectedAsset?.filmProfileId]);

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

  const updateFilmOverrides = useCallback(
    (
      updater: (
        prev: NonNullable<Asset["filmOverrides"]>
      ) => NonNullable<Asset["filmOverrides"]>
    ) => {
      if (!selectedAsset) {
        return;
      }
      const current = selectedAsset.filmOverrides ?? {};
      const next = updater(current);
      updateAsset(selectedAsset.id, {
        filmOverrides: next,
      });
    },
    [selectedAsset, updateAsset]
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

  const handleSetFilmModuleAmount = useCallback(
    (moduleId: FilmModuleId, value: number) => {
      updateFilmOverrides((prev) => ({
        ...prev,
        [moduleId]: {
          ...(prev[moduleId] ?? {}),
          amount: value,
        },
      }));
    },
    [updateFilmOverrides]
  );

  const handleToggleFilmModule = useCallback(
    (moduleId: FilmModuleId) => {
      if (!previewFilmProfile) {
        return;
      }
      const current = previewFilmProfile.modules.find((module) => module.id === moduleId);
      if (!current) {
        return;
      }
      updateFilmOverrides((prev) => ({
        ...prev,
        [moduleId]: {
          ...(prev[moduleId] ?? {}),
          enabled: !current.enabled,
        },
      }));
    },
    [previewFilmProfile, updateFilmOverrides]
  );

  const handleSetFilmModuleParam = useCallback(
    <TId extends FilmModuleId>(moduleId: TId, key: FilmNumericParamKey<TId>, value: number) => {
      updateFilmOverrides((prev) => ({
        ...prev,
        [moduleId]: {
          ...(prev[moduleId] ?? {}),
          params: {
            ...((prev[moduleId]?.params as Record<string, number>) ?? {}),
            [key]: value,
          },
        },
      }));
    },
    [updateFilmOverrides]
  );

  const handleSetFilmModuleRgbMix = useCallback(
    (moduleId: FilmModuleId, channel: 0 | 1 | 2, value: number) => {
      if (!previewFilmProfile || moduleId !== "colorScience") {
        return;
      }
      const module = previewFilmProfile.modules.find((item) => item.id === moduleId);
      if (!module || module.id !== "colorScience") {
        return;
      }
      const nextMix: [number, number, number] = [...module.params.rgbMix] as [
        number,
        number,
        number,
      ];
      nextMix[channel] = value;
      updateFilmOverrides((prev) => ({
        ...prev,
        [moduleId]: {
          ...(prev[moduleId] ?? {}),
          params: {
            ...((prev[moduleId]?.params as Record<string, unknown>) ?? {}),
            rgbMix: nextMix,
          },
        },
      }));
    },
    [previewFilmProfile, updateFilmOverrides]
  );

  const handleResetFilmOverrides = useCallback(() => {
    if (!selectedAsset) {
      return;
    }
    updateAsset(selectedAsset.id, {
      filmOverrides: undefined,
    });
  }, [selectedAsset, updateAsset]);

  const handleResetAll = useCallback(() => {
    if (!selectedAsset) {
      return false;
    }
    updateAsset(selectedAsset.id, {
      adjustments: createDefaultAdjustments(),
      filmOverrides: undefined,
    });
    return true;
  }, [selectedAsset, updateAsset]);

  const handleCopy = useCallback(() => {
    if (!adjustments) {
      return false;
    }
    setCopiedAdjustments(cloneAdjustments(adjustments));
    return true;
  }, [adjustments, setCopiedAdjustments]);

  const handlePaste = useCallback(() => {
    if (!selectedAsset || !copiedAdjustments) {
      return false;
    }
    updateAsset(selectedAsset.id, { adjustments: cloneAdjustments(copiedAdjustments) });
    return true;
  }, [copiedAdjustments, selectedAsset, updateAsset]);

  const handleSelectPreset = useCallback(
    (presetId: string) => {
      if (!selectedAsset) {
        return;
      }
      const preset = allPresets.find((item) => item.id === presetId);
      updateAsset(selectedAsset.id, {
        presetId,
        filmProfileId: preset?.filmProfileId,
        filmProfile: preset?.filmProfile,
        filmOverrides: undefined,
      });
    },
    [allPresets, selectedAsset, updateAsset]
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

  const handleSelectFilmProfile = useCallback(
    (filmProfileId: string | undefined) => {
      if (!selectedAsset) {
        return;
      }
      updateAsset(selectedAsset.id, {
        filmProfileId,
        filmProfile: undefined,
      });
    },
    [selectedAsset, updateAsset]
  );

  const handleSaveCustomPreset = useCallback(() => {
    if (!previewAdjustments) {
      return false;
    }
    const name = customPresetName.trim();
    if (!name) {
      return false;
    }
    const custom: Preset = {
      id: `custom-${Date.now()}`,
      name,
      tags: (basePresets[0]?.tags ?? []) as Preset["tags"],
      intensity: 100,
      description: "Custom film profile",
      adjustments: buildCustomAdjustments(previewAdjustments),
      filmProfile: previewFilmProfile ?? undefined,
    };
    setCustomPresets((prev) => [custom, ...prev]);
    setCustomPresetName("");
    if (selectedAsset) {
      updateAsset(selectedAsset.id, {
        presetId: custom.id,
        intensity: 100,
        filmProfile: custom.filmProfile,
        filmProfileId: undefined,
        filmOverrides: undefined,
      });
    }
    return true;
  }, [
    customPresetName,
    previewAdjustments,
    previewFilmProfile,
    selectedAsset,
    setCustomPresetName,
    setCustomPresets,
    updateAsset,
  ]);

  const handleExportPresets = useCallback(() => {
    if (customPresets.length === 0) {
      return false;
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
    return true;
  }, [customPresets]);

  const handleExportFilmProfile = useCallback(() => {
    if (!previewFilmProfile) {
      return false;
    }
    const blob = new Blob([JSON.stringify(previewFilmProfile, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${previewFilmProfile.id || "film-profile"}.json`;
    link.click();
    URL.revokeObjectURL(url);
    return true;
  }, [previewFilmProfile]);

  const handleImportFilmProfile = useCallback(
    async (file: File | null) => {
      if (!file || !selectedAsset) {
        return false;
      }
      try {
        const text = await file.text();
        const parsed = JSON.parse(text) as unknown;
        if (!parsed || typeof parsed !== "object") {
          return false;
        }
        const normalized = normalizeFilmProfile(parsed as NonNullable<Asset["filmProfile"]>);
        updateAsset(selectedAsset.id, {
          filmProfile: normalized,
          filmProfileId: undefined,
          filmOverrides: undefined,
        });
        return true;
      } catch {
        return false;
      }
    },
    [selectedAsset, updateAsset]
  );

  const handleImportPresets = useCallback(
    async (file: File | null) => {
      if (!file) {
        return 0;
      }
      try {
        const text = await file.text();
        const parsed = JSON.parse(text) as unknown;
        const normalized = normalizeImportedPresets(parsed);
        if (normalized.length > 0) {
          setCustomPresets((prev) => mergePresetsById(prev, normalized));
        }
        return normalized.length;
      } catch {
        return 0;
      }
    },
    [setCustomPresets]
  );

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
    previewAdjustments,
    previewFilmProfile,
    previewHistogram,
    presetLabel,
    filmProfileLabel,
    showOriginal,
    copiedAdjustments,
    customPresetName,
    customPresets,
    builtInFilmProfiles,
    activeHslColor,
    curveChannel,
    openSections,
    setSelectedAssetId,
    setShowOriginal,
    setCustomPresetName,
    setActiveHslColor,
    setCurveChannel,
    toggleOriginal,
    updateAdjustments,
    updateAdjustmentValue,
    updateHslValue,
    toggleFlip,
    toggleSection,
    handlePreviewHistogramChange,
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
    handleImportPresets,
    handleExportFilmProfile,
    handleImportFilmProfile,
  };
}



