import { useCallback, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { presets as basePresets } from "@/data/presets";
import { createDefaultAdjustments } from "@/lib/adjustments";
import { listBuiltInFilmProfiles, normalizeFilmProfile } from "@/lib/film";
import { useEditorStore } from "@/stores/editorStore";
import type {
  Asset,
  AssetUpdate,
  EditingAdjustments,
  FilmModuleId,
  FilmNumericParamKey,
  Preset,
} from "@/types";
import {
  buildCustomAdjustments,
  mergePresetsById,
  normalizeImportedPresets,
  resolveAdjustments,
  resolveFilmProfile,
} from "./presetUtils";
import { cloneAdjustments } from "./utils";

type UpdateMode = "live" | "commit";
type FilmOverridesState = NonNullable<Asset["filmOverrides"]>;

interface EditorPatchActions {
  applyEditorPatch: (patch: AssetUpdate) => boolean;
  stageEditorPatch: (historyKey: string, patch: AssetUpdate) => void;
  commitEditorPatch: (historyKey: string, patch: AssetUpdate) => boolean;
}

export function useEditorFilmProfile(
  selectedAsset: Asset | null,
  adjustments: EditingAdjustments | null,
  actions: EditorPatchActions
) {
  const { applyEditorPatch, stageEditorPatch, commitEditorPatch } = actions;

  const {
    copiedAdjustments,
    customPresetName,
    customPresets,
    setCopiedAdjustments,
    setCustomPresetName,
    setCustomPresets,
  } = useEditorStore(
    useShallow((state) => ({
      copiedAdjustments: state.copiedAdjustments,
      customPresetName: state.customPresetName,
      customPresets: state.customPresets,
      setCopiedAdjustments: state.setCopiedAdjustments,
      setCustomPresetName: state.setCustomPresetName,
      setCustomPresets: state.setCustomPresets,
    }))
  );

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
    return allPresets.find((preset) => preset.id === selectedAsset.presetId)?.name ?? "未指定";
  }, [allPresets, selectedAsset?.presetId]);

  const filmProfileLabel = useMemo(() => {
    if (previewFilmProfile) {
      return previewFilmProfile.name;
    }
    if (selectedAsset?.filmProfileId) {
      return selectedAsset.filmProfileId;
    }
    return "自动";
  }, [previewFilmProfile, selectedAsset?.filmProfileId]);

  const applyFilmOverrides = useCallback(
    (
      updater: (prev: FilmOverridesState) => FilmOverridesState,
      options?: { mode?: UpdateMode; historyKey?: string }
    ) => {
      if (!selectedAsset) {
        return false;
      }
      const current = (selectedAsset.filmOverrides ?? {}) as FilmOverridesState;
      const next = updater(current);
      const patch: AssetUpdate = { filmOverrides: next };
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
          [moduleId]: { ...(prev[moduleId] ?? {}), amount: value },
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
        [moduleId]: { ...(prev[moduleId] ?? {}), enabled: !current.enabled },
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
    (moduleId: FilmModuleId, channel: 0 | 1 | 2, value: number, mode: UpdateMode = "commit") => {
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
    return applyEditorPatch({ filmOverrides: undefined });
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
      const patch: AssetUpdate = { intensity: value };
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
      description: "自定义胶片档案",
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

  return {
    allPresets,
    builtInFilmProfiles,
    previewAdjustments,
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
  };
}
