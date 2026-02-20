import { useCallback, useEffect, useMemo, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { presets as basePresets } from "@/data/presets";
import { createDefaultAdjustments, normalizeAdjustments } from "@/lib/adjustments";
import { listBuiltInFilmProfiles, normalizeFilmProfile } from "@/lib/film";
import {
  createEditorAssetSnapshot,
  editorSnapshotToAssetPatch,
  isEditorAssetSnapshotEqual,
  type EditorAssetSnapshot,
} from "@/pages/editor/history";
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

type UpdateMode = "live" | "commit";
type FilmOverridesState = NonNullable<Asset["filmOverrides"]>;
type PendingHistoryByKey = Record<string, EditorAssetSnapshot>;

const createHistorySessionKey = (assetId: string, key: string) => `${assetId}:${key}`;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const rgbToHue = (red: number, green: number, blue: number) => {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta === 0) {
    return 0;
  }
  let hue = 0;
  if (max === r) {
    hue = ((g - b) / delta) % 6;
  } else if (max === g) {
    hue = (b - r) / delta + 2;
  } else {
    hue = (r - g) / delta + 4;
  }
  return (hue * 60 + 360) % 360;
};

const mapHueToHslColor = (hue: number): HslColorKey => {
  if (hue < 15 || hue >= 345) {
    return "red";
  }
  if (hue < 40) {
    return "orange";
  }
  if (hue < 70) {
    return "yellow";
  }
  if (hue < 170) {
    return "green";
  }
  if (hue < 200) {
    return "aqua";
  }
  if (hue < 255) {
    return "blue";
  }
  if (hue < 300) {
    return "purple";
  }
  return "magenta";
};

const toHex = (value: number) => {
  const clamped = clamp(Math.round(value), 0, 255);
  return clamped.toString(16).padStart(2, "0");
};

export function useEditorState() {
  const { assets, updateAsset, updateAssetOnly } = useProjectStore(
    useShallow((state) => ({
      assets: state.assets,
      updateAsset: state.updateAsset,
      updateAssetOnly: state.updateAssetOnly,
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
    pointColorPicking,
    lastPointColorSample,
    historyByAssetId,
    setSelectedAssetId,
    setShowOriginal,
    setCopiedAdjustments,
    setCustomPresetName,
    setCustomPresets,
    setActiveHslColor,
    setCurveChannel,
    setPointColorPicking,
    setLastPointColorSample,
    toggleOriginal,
    toggleSection,
    setPreviewHistogram,
    pushHistory,
    undoSnapshot,
    redoSnapshot,
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
      pointColorPicking: state.pointColorPicking,
      lastPointColorSample: state.lastPointColorSample,
      historyByAssetId: state.historyByAssetId,
      setSelectedAssetId: state.setSelectedAssetId,
      setShowOriginal: state.setShowOriginal,
      setCopiedAdjustments: state.setCopiedAdjustments,
      setCustomPresetName: state.setCustomPresetName,
      setCustomPresets: state.setCustomPresets,
      setActiveHslColor: state.setActiveHslColor,
      setCurveChannel: state.setCurveChannel,
      setPointColorPicking: state.setPointColorPicking,
      setLastPointColorSample: state.setLastPointColorSample,
      toggleOriginal: state.toggleOriginal,
      toggleSection: state.toggleSection,
      setPreviewHistogram: state.setPreviewHistogram,
      pushHistory: state.pushHistory,
      undoSnapshot: state.undoSnapshot,
      redoSnapshot: state.redoSnapshot,
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
    return normalizeAdjustments(selectedAsset.adjustments);
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

  const pendingHistoryRef = useRef<PendingHistoryByKey>({});

  useEffect(() => {
    pendingHistoryRef.current = {};
  }, [selectedAssetId]);

  const clearPendingHistoryForAsset = useCallback((assetId: string) => {
    const prefix = `${assetId}:`;
    Object.keys(pendingHistoryRef.current).forEach((key) => {
      if (key.startsWith(prefix)) {
        delete pendingHistoryRef.current[key];
      }
    });
  }, []);

  const applyEditorPatch = useCallback(
    (
      patch: Partial<Asset>,
      options?: {
        before?: EditorAssetSnapshot;
      }
    ) => {
      if (!selectedAsset) {
        return false;
      }
      const before = options?.before ?? createEditorAssetSnapshot(selectedAsset);
      const after = createEditorAssetSnapshot({
        ...selectedAsset,
        ...patch,
      } as Asset);
      if (isEditorAssetSnapshotEqual(before, after)) {
        return false;
      }
      pushHistory(selectedAsset.id, before);
      updateAsset(selectedAsset.id, patch);
      return true;
    },
    [pushHistory, selectedAsset, updateAsset]
  );

  const stageEditorPatch = useCallback(
    (historyKey: string, patch: Partial<Asset>) => {
      if (!selectedAsset) {
        return;
      }
      const sessionKey = createHistorySessionKey(selectedAsset.id, historyKey);
      if (!pendingHistoryRef.current[sessionKey]) {
        pendingHistoryRef.current[sessionKey] = createEditorAssetSnapshot(selectedAsset);
      }
      const before = pendingHistoryRef.current[sessionKey];
      const after = createEditorAssetSnapshot({
        ...selectedAsset,
        ...patch,
      } as Asset);
      if (isEditorAssetSnapshotEqual(before, after)) {
        return;
      }
      updateAssetOnly(selectedAsset.id, patch);
    },
    [selectedAsset, updateAssetOnly]
  );

  const commitEditorPatch = useCallback(
    (historyKey: string, patch: Partial<Asset>) => {
      if (!selectedAsset) {
        return false;
      }
      const sessionKey = createHistorySessionKey(selectedAsset.id, historyKey);
      const before =
        pendingHistoryRef.current[sessionKey] ??
        createEditorAssetSnapshot(selectedAsset);
      delete pendingHistoryRef.current[sessionKey];
      return applyEditorPatch(patch, { before });
    },
    [applyEditorPatch, selectedAsset]
  );

  const canUndo = Boolean(
    selectedAssetId &&
      historyByAssetId[selectedAssetId] &&
      historyByAssetId[selectedAssetId].past.length > 0
  );

  const canRedo = Boolean(
    selectedAssetId &&
      historyByAssetId[selectedAssetId] &&
      historyByAssetId[selectedAssetId].future.length > 0
  );

  const updateAdjustments = useCallback(
    (partial: Partial<EditingAdjustments>) => {
      if (!selectedAsset) {
        return;
      }
      const nextAdjustments = {
        ...(normalizeAdjustments(selectedAsset.adjustments)),
        ...partial,
      };
      void applyEditorPatch({
        adjustments: nextAdjustments,
      });
    },
    [applyEditorPatch, selectedAsset]
  );

  const previewAdjustmentValue = useCallback(
    (key: NumericAdjustmentKey, value: number) => {
      if (!selectedAsset) {
        return;
      }
      const nextAdjustments = {
        ...(normalizeAdjustments(selectedAsset.adjustments)),
        [key]: value,
      };
      stageEditorPatch(`adjustment:${key}`, {
        adjustments: nextAdjustments,
      });
    },
    [selectedAsset, stageEditorPatch]
  );

  const updateAdjustmentValue = useCallback(
    (key: NumericAdjustmentKey, value: number) => {
      if (!selectedAsset) {
        return;
      }
      const nextAdjustments = {
        ...(normalizeAdjustments(selectedAsset.adjustments)),
        [key]: value,
      };
      void commitEditorPatch(`adjustment:${key}`, {
        adjustments: nextAdjustments,
      });
    },
    [commitEditorPatch, selectedAsset]
  );

  const previewHslValue = useCallback(
    (
      color: HslColorKey,
      channel: "hue" | "saturation" | "luminance",
      value: number
    ) => {
      if (!selectedAsset) {
        return;
      }
      const currentAdjustments =
        normalizeAdjustments(selectedAsset.adjustments);
      stageEditorPatch(`hsl:${color}:${channel}`, {
        adjustments: {
          ...currentAdjustments,
          hsl: {
            ...currentAdjustments.hsl,
            [color]: {
              ...currentAdjustments.hsl[color],
              [channel]: value,
            },
          },
        },
      });
    },
    [selectedAsset, stageEditorPatch]
  );

  const updateHslValue = useCallback(
    (
      color: HslColorKey,
      channel: "hue" | "saturation" | "luminance",
      value: number
    ) => {
      if (!selectedAsset) {
        return;
      }
      const currentAdjustments =
        normalizeAdjustments(selectedAsset.adjustments);
      void commitEditorPatch(`hsl:${color}:${channel}`, {
        adjustments: {
          ...currentAdjustments,
          hsl: {
            ...currentAdjustments.hsl,
            [color]: {
              ...currentAdjustments.hsl[color],
              [channel]: value,
            },
          },
        },
      });
    },
    [commitEditorPatch, selectedAsset]
  );

  const previewColorGradingZone = useCallback(
    (
      zone: "shadows" | "midtones" | "highlights",
      value: EditingAdjustments["colorGrading"]["shadows"]
    ) => {
      if (!selectedAsset) {
        return;
      }
      const currentAdjustments =
        normalizeAdjustments(selectedAsset.adjustments);
      stageEditorPatch(`grading:${zone}`, {
        adjustments: {
          ...currentAdjustments,
          colorGrading: {
            ...currentAdjustments.colorGrading,
            [zone]: value,
          },
        },
      });
    },
    [selectedAsset, stageEditorPatch]
  );

  const updateColorGradingZone = useCallback(
    (
      zone: "shadows" | "midtones" | "highlights",
      value: EditingAdjustments["colorGrading"]["shadows"]
    ) => {
      if (!selectedAsset) {
        return;
      }
      const currentAdjustments =
        normalizeAdjustments(selectedAsset.adjustments);
      void commitEditorPatch(`grading:${zone}`, {
        adjustments: {
          ...currentAdjustments,
          colorGrading: {
            ...currentAdjustments.colorGrading,
            [zone]: value,
          },
        },
      });
    },
    [commitEditorPatch, selectedAsset]
  );

  const previewColorGradingValue = useCallback(
    (key: "blend" | "balance", value: number) => {
      if (!selectedAsset) {
        return;
      }
      const currentAdjustments =
        normalizeAdjustments(selectedAsset.adjustments);
      stageEditorPatch(`grading:${key}`, {
        adjustments: {
          ...currentAdjustments,
          colorGrading: {
            ...currentAdjustments.colorGrading,
            [key]: value,
          },
        },
      });
    },
    [selectedAsset, stageEditorPatch]
  );

  const updateColorGradingValue = useCallback(
    (key: "blend" | "balance", value: number) => {
      if (!selectedAsset) {
        return;
      }
      const currentAdjustments =
        normalizeAdjustments(selectedAsset.adjustments);
      void commitEditorPatch(`grading:${key}`, {
        adjustments: {
          ...currentAdjustments,
          colorGrading: {
            ...currentAdjustments.colorGrading,
            [key]: value,
          },
        },
      });
    },
    [commitEditorPatch, selectedAsset]
  );

  const resetColorGrading = useCallback(() => {
    if (!selectedAsset) {
      return false;
    }
    const currentAdjustments =
      normalizeAdjustments(selectedAsset.adjustments);
    const defaults = createDefaultAdjustments().colorGrading;
    return applyEditorPatch({
      adjustments: {
        ...currentAdjustments,
        colorGrading: {
          shadows: { ...defaults.shadows },
          midtones: { ...defaults.midtones },
          highlights: { ...defaults.highlights },
          blend: defaults.blend,
          balance: defaults.balance,
        },
      },
    });
  }, [applyEditorPatch, selectedAsset]);

  const startPointColorPick = useCallback(() => {
    setPointColorPicking(true);
  }, [setPointColorPicking]);

  const cancelPointColorPick = useCallback(() => {
    setPointColorPicking(false);
  }, [setPointColorPicking]);

  const commitPointColorSample = useCallback(
    (sample: { red: number; green: number; blue: number }) => {
      const hue = rgbToHue(sample.red, sample.green, sample.blue);
      const mappedColor = mapHueToHslColor(hue);
      const hex = `#${toHex(sample.red)}${toHex(sample.green)}${toHex(sample.blue)}`;
      setActiveHslColor(mappedColor);
      setLastPointColorSample({
        red: sample.red,
        green: sample.green,
        blue: sample.blue,
        hue,
        hex,
        mappedColor,
      });
      setPointColorPicking(false);
      return mappedColor;
    },
    [setActiveHslColor, setLastPointColorSample, setPointColorPicking]
  );

  const toggleFlip = useCallback(
    (axis: "flipHorizontal" | "flipVertical") => {
      if (!selectedAsset) {
        return;
      }
      const currentAdjustments =
        normalizeAdjustments(selectedAsset.adjustments);
      void applyEditorPatch({
        adjustments: {
          ...currentAdjustments,
          [axis]: !currentAdjustments[axis],
        },
      });
    },
    [applyEditorPatch, selectedAsset]
  );

  const applyFilmOverrides = useCallback(
    (
      updater: (prev: FilmOverridesState) => FilmOverridesState,
      options?: {
        mode?: UpdateMode;
        historyKey?: string;
      }
    ) => {
      if (!selectedAsset) {
        return false;
      }
      const current = (selectedAsset.filmOverrides ?? {}) as FilmOverridesState;
      const next = updater(current);
      const patch: Partial<Asset> = {
        filmOverrides: next,
      };
      if (options?.mode === "live" && options.historyKey) {
        stageEditorPatch(options.historyKey, patch);
        return true;
      }
      if (options?.historyKey) {
        return commitEditorPatch(options.historyKey, patch);
      }
      return applyEditorPatch(patch);
    },
    [applyEditorPatch, commitEditorPatch, selectedAsset, stageEditorPatch]
  );

  const handleSetFilmModuleAmount = useCallback(
    (moduleId: FilmModuleId, value: number, mode: UpdateMode = "commit") => {
      void applyFilmOverrides(
        (prev) => ({
          ...prev,
          [moduleId]: {
            ...(prev[moduleId] ?? {}),
            amount: value,
          },
        }),
        mode === "live"
          ? { mode, historyKey: `film:${moduleId}:amount` }
          : { historyKey: `film:${moduleId}:amount` }
      );
    },
    [applyFilmOverrides]
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
      void applyFilmOverrides((prev) => ({
        ...prev,
        [moduleId]: {
          ...(prev[moduleId] ?? {}),
          enabled: !current.enabled,
        },
      }));
    },
    [applyFilmOverrides, previewFilmProfile]
  );

  const handleSetFilmModuleParam = useCallback(
    <TId extends FilmModuleId>(
      moduleId: TId,
      key: FilmNumericParamKey<TId>,
      value: number,
      mode: UpdateMode = "commit"
    ) => {
      void applyFilmOverrides(
        (prev) => ({
          ...prev,
          [moduleId]: {
            ...(prev[moduleId] ?? {}),
            params: {
              ...((prev[moduleId]?.params as Record<string, number>) ?? {}),
              [key]: value,
            },
          },
        }),
        mode === "live"
          ? { mode, historyKey: `film:${moduleId}:param:${String(key)}` }
          : { historyKey: `film:${moduleId}:param:${String(key)}` }
      );
    },
    [applyFilmOverrides]
  );

  const handleSetFilmModuleRgbMix = useCallback(
    (
      moduleId: FilmModuleId,
      channel: 0 | 1 | 2,
      value: number,
      mode: UpdateMode = "commit"
    ) => {
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
      void applyFilmOverrides(
        (prev) => ({
          ...prev,
          [moduleId]: {
            ...(prev[moduleId] ?? {}),
            params: {
              ...((prev[moduleId]?.params as Record<string, unknown>) ?? {}),
              rgbMix: nextMix,
            },
          },
        }),
        mode === "live"
          ? { mode, historyKey: `film:${moduleId}:rgbMix:${channel}` }
          : { historyKey: `film:${moduleId}:rgbMix:${channel}` }
      );
    },
    [applyFilmOverrides, previewFilmProfile]
  );

  const handleResetFilmOverrides = useCallback(() => {
    if (!selectedAsset) {
      return false;
    }
    return applyEditorPatch({
      filmOverrides: undefined,
    });
  }, [applyEditorPatch, selectedAsset]);

  const handleResetAll = useCallback(() => {
    if (!selectedAsset) {
      return false;
    }
    return applyEditorPatch({
      adjustments: createDefaultAdjustments(),
      filmOverrides: undefined,
    });
  }, [applyEditorPatch, selectedAsset]);

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
    return applyEditorPatch({
      adjustments: cloneAdjustments(copiedAdjustments),
    });
  }, [applyEditorPatch, copiedAdjustments, selectedAsset]);

  const handleSelectPreset = useCallback(
    (presetId: string) => {
      if (!selectedAsset) {
        return false;
      }
      const preset = allPresets.find((item) => item.id === presetId);
      return applyEditorPatch({
        presetId,
        filmProfileId: preset?.filmProfileId,
        filmProfile: preset?.filmProfile,
        filmOverrides: undefined,
      });
    },
    [allPresets, applyEditorPatch, selectedAsset]
  );

  const handleSetIntensity = useCallback(
    (value: number, mode: UpdateMode = "commit") => {
      if (!selectedAsset) {
        return;
      }
      const patch: Partial<Asset> = { intensity: value };
      if (mode === "live") {
        stageEditorPatch("intensity", patch);
        return;
      }
      void commitEditorPatch("intensity", patch);
    },
    [commitEditorPatch, selectedAsset, stageEditorPatch]
  );

  const handleSelectFilmProfile = useCallback(
    (filmProfileId: string | undefined) => {
      if (!selectedAsset) {
        return false;
      }
      return applyEditorPatch({
        filmProfileId,
        filmProfile: undefined,
      });
    },
    [applyEditorPatch, selectedAsset]
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
      void applyEditorPatch({
        presetId: custom.id,
        intensity: 100,
        filmProfile: custom.filmProfile,
        filmProfileId: undefined,
        filmOverrides: undefined,
      });
    }
    return true;
  }, [
    applyEditorPatch,
    customPresetName,
    previewAdjustments,
    previewFilmProfile,
    selectedAsset,
    setCustomPresetName,
    setCustomPresets,
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
        return applyEditorPatch({
          filmProfile: normalized,
          filmProfileId: undefined,
          filmOverrides: undefined,
        });
      } catch {
        return false;
      }
    },
    [applyEditorPatch, selectedAsset]
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

  const handleUndo = useCallback(() => {
    if (!selectedAsset) {
      return false;
    }
    clearPendingHistoryForAsset(selectedAsset.id);
    const current = createEditorAssetSnapshot(selectedAsset);
    const previous = undoSnapshot(selectedAsset.id, current);
    if (!previous) {
      return false;
    }
    updateAsset(selectedAsset.id, editorSnapshotToAssetPatch(previous));
    return true;
  }, [clearPendingHistoryForAsset, selectedAsset, undoSnapshot, updateAsset]);

  const handleRedo = useCallback(() => {
    if (!selectedAsset) {
      return false;
    }
    clearPendingHistoryForAsset(selectedAsset.id);
    const current = createEditorAssetSnapshot(selectedAsset);
    const next = redoSnapshot(selectedAsset.id, current);
    if (!next) {
      return false;
    }
    updateAsset(selectedAsset.id, editorSnapshotToAssetPatch(next));
    return true;
  }, [clearPendingHistoryForAsset, redoSnapshot, selectedAsset, updateAsset]);

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
    pointColorPicking,
    lastPointColorSample,
    curveChannel,
    openSections,
    canUndo,
    canRedo,
    setSelectedAssetId,
    setShowOriginal,
    setCustomPresetName,
    setActiveHslColor,
    setCurveChannel,
    toggleOriginal,
    toggleSection,
    updateAdjustments,
    previewAdjustmentValue,
    updateAdjustmentValue,
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
    handleUndo,
    handleRedo,
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

