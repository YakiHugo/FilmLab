import { useCallback, useEffect, useMemo, useState } from "react";
import { presets as basePresets } from "@/data/presets";
import { createDefaultAdjustments, normalizeAdjustments } from "@/lib/adjustments";
import type { RecommendFilmPresetCandidate } from "@/lib/ai/client";
import type { AiPresetRecommendation, Asset, EditingAdjustments, Preset } from "@/types";
import {
  buildCustomAdjustments,
  loadCustomPresets,
  persistCustomPresets,
  resolveAdjustments,
  resolveFilmProfile,
} from "../utils";

interface UseWorkspacePresetsOptions {
  activeAsset: Asset | null;
  updateAsset: (assetId: string, update: Record<string, unknown>) => void;
}

export function useWorkspacePresets({ activeAsset, updateAsset }: UseWorkspacePresetsOptions) {
  const [selectedPresetId, setSelectedPresetId] = useState(basePresets[0]?.id ?? "");
  const [intensity, setIntensity] = useState(basePresets[0]?.intensity ?? 60);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [customPresetName, setCustomPresetName] = useState("");
  const [customPresets, setCustomPresets] = useState<Preset[]>(loadCustomPresets);

  useEffect(() => {
    persistCustomPresets(customPresets);
  }, [customPresets]);

  const allPresets = useMemo(() => [...basePresets, ...customPresets], [customPresets]);
  const customPresetIdSet = useMemo(
    () => new Set(customPresets.map((preset) => preset.id)),
    [customPresets]
  );
  const presetById = useMemo(
    () => new Map(allPresets.map((preset) => [preset.id, preset])),
    [allPresets]
  );
  const aiPresetCandidates = useMemo<RecommendFilmPresetCandidate[]>(
    () =>
      allPresets.map((preset) => ({
        id: preset.id,
        name: preset.name,
        description: preset.description,
        tags: preset.tags,
        intensity: preset.intensity,
        isCustom: customPresetIdSet.has(preset.id),
      })),
    [allPresets, customPresetIdSet]
  );

  const activeRecommendedTopPresets = useMemo(() => {
    if (!activeAsset?.aiRecommendation) {
      return [] as Array<{
        preset: Preset;
        recommendation: AiPresetRecommendation;
      }>;
    }
    return activeAsset.aiRecommendation.topPresets
      .map((item) => {
        const preset = presetById.get(item.presetId);
        if (!preset) {
          return null;
        }
        return { preset, recommendation: item };
      })
      .filter(
        (item): item is { preset: Preset; recommendation: AiPresetRecommendation } => item !== null
      );
  }, [activeAsset?.aiRecommendation, presetById]);

  const activeAdjustments = useMemo(() => {
    if (!activeAsset) {
      return null;
    }
    return normalizeAdjustments(activeAsset.adjustments ?? createDefaultAdjustments());
  }, [activeAsset]);

  const previewAdjustments = useMemo(() => {
    if (!activeAsset) {
      return null;
    }
    return resolveAdjustments(
      activeAdjustments ?? undefined,
      activeAsset.presetId,
      activeAsset.intensity,
      allPresets
    );
  }, [activeAdjustments, activeAsset, allPresets]);

  const previewFilmProfile = useMemo(() => {
    if (!activeAsset || !previewAdjustments) {
      return null;
    }
    return resolveFilmProfile(
      previewAdjustments,
      activeAsset.presetId,
      activeAsset.filmProfileId,
      activeAsset.filmProfile,
      activeAsset.intensity,
      allPresets,
      activeAsset.filmOverrides
    );
  }, [activeAsset, allPresets, previewAdjustments]);

  const applyPreset = useCallback(
    (presetId: string) => {
      if (!activeAsset) {
        return;
      }
      const preset = allPresets.find((item) => item.id === presetId);
      setSelectedPresetId(presetId);
      updateAsset(activeAsset.id, {
        presetId,
        intensity,
        filmProfileId: preset?.filmProfileId,
        filmProfile: preset?.filmProfile,
        filmOverrides: undefined,
      });
    },
    [activeAsset, allPresets, intensity, updateAsset]
  );

  const handleIntensityChange = useCallback(
    (value: number) => {
      setIntensity(value);
      if (!activeAsset) {
        return;
      }
      updateAsset(activeAsset.id, { intensity: value });
    },
    [activeAsset, updateAsset]
  );

  const updateAdjustmentValue = useCallback(
    (key: keyof EditingAdjustments, value: number) => {
      if (!activeAsset || !activeAdjustments) {
        return;
      }
      updateAsset(activeAsset.id, {
        adjustments: {
          ...activeAdjustments,
          [key]: value,
        },
      });
    },
    [activeAsset, activeAdjustments, updateAsset]
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
      tags: ["portrait"],
      intensity: 100,
      description: "自定义风格",
      adjustments: buildCustomAdjustments(previewAdjustments),
      filmProfile: previewFilmProfile ?? undefined,
    };
    setCustomPresets((prev) => [custom, ...prev]);
    setCustomPresetName("");
    setSelectedPresetId(custom.id);
    if (activeAsset) {
      updateAsset(activeAsset.id, {
        presetId: custom.id,
        intensity: 100,
        filmProfile: custom.filmProfile,
        filmProfileId: undefined,
        filmOverrides: undefined,
      });
    }
  }, [activeAsset, customPresetName, previewAdjustments, previewFilmProfile, updateAsset]);

  return {
    selectedPresetId,
    setSelectedPresetId,
    intensity,
    setIntensity,
    advancedOpen,
    setAdvancedOpen,
    customPresetName,
    setCustomPresetName,
    customPresets,
    allPresets,
    presetById,
    aiPresetCandidates,
    activeRecommendedTopPresets,
    activeAdjustments,
    previewAdjustments,
    previewFilmProfile,
    applyPreset,
    handleIntensityChange,
    updateAdjustmentValue,
    handleSaveCustomPreset,
  };
}
