import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { presets as basePresets } from "@/data/presets";
import { createDefaultAdjustments, normalizeAdjustments } from "@/lib/adjustments";
import type { RecommendFilmPresetCandidate } from "@/lib/ai/client";
import {
  MAX_STYLE_SELECTION,
  applySelectionLimit,
  toggleSelectionWithLimit,
} from "@/lib/ai/recommendationUtils";
import { useProjectStore, type AddAssetsResult } from "@/stores/projectStore";
import { useShallow } from "zustand/react/shallow";
import type { AiPresetRecommendation, EditingAdjustments, Preset } from "@/types";
import type { WorkspaceStep } from "../types";
import { WORKSPACE_STEPS, isSupportedImportFile } from "../constants";
import {
  buildCustomAdjustments,
  loadCustomPresets,
  persistCustomPresets,
  resolveAdjustments,
  resolveFilmProfile,
} from "../utils";
import {
  clampIntensity,
  loadWorkspaceContext,
  persistWorkspaceContext,
  type PersistedWorkspaceContext,
} from "./exportHelpers";
import { useExport } from "./useExport";

export const useWorkspaceState = () => {
  const navigate = useNavigate({ from: "/" });
  const { step } = useSearch({ from: "/" });
  const currentStep: WorkspaceStep = step === "style" || step === "export" ? step : "library";
  const {
    project,
    assets,
    isLoading,
    addAssets,
    isImporting,
    selectedAssetIds,
    setSelectedAssetIds,
    clearAssetSelection,
    applyPresetToGroup,
    applyPresetToSelection,
    updateAsset,
  } = useProjectStore(
    useShallow((state) => ({
      project: state.project,
      assets: state.assets,
      isLoading: state.isLoading,
      addAssets: state.addAssets,
      isImporting: state.isImporting,
      selectedAssetIds: state.selectedAssetIds,
      setSelectedAssetIds: state.setSelectedAssetIds,
      clearAssetSelection: state.clearAssetSelection,
      applyPresetToGroup: state.applyPresetToGroup,
      applyPresetToSelection: state.applyPresetToSelection,
      updateAsset: state.updateAsset,
    }))
  );

  const [isDragging, setIsDragging] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("all");
  const [activeAssetId, setActiveAssetId] = useState<string | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState(basePresets[0]?.id ?? "");
  const [intensity, setIntensity] = useState(basePresets[0]?.intensity ?? 60);
  const [showOriginal, setShowOriginal] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [customPresetName, setCustomPresetName] = useState("");
  const [customPresets, setCustomPresets] = useState<Preset[]>(loadCustomPresets);
  const [format, setFormat] = useState<"original" | "jpeg" | "png">("original");
  const [quality, setQuality] = useState(92);
  const [maxDimension, setMaxDimension] = useState(0);
  const [selectionNotice, setSelectionNotice] = useState<string | null>(null);
  const [importNotice, setImportNotice] = useState<string | null>(null);

  const didAutoSelect = useRef(false);
  const didRestoreContext = useRef(false);
  const persistedContext = useRef<PersistedWorkspaceContext | null>(loadWorkspaceContext());
  const selectedAssetIdsRef = useRef<string[]>(selectedAssetIds);

  useEffect(() => {
    if (!importNotice) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setImportNotice(null);
    }, 2800);
    return () => window.clearTimeout(timer);
  }, [importNotice]);

  useEffect(() => {
    selectedAssetIdsRef.current = selectedAssetIds;
  }, [selectedAssetIds]);

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

  useEffect(() => {
    persistCustomPresets(customPresets);
  }, [customPresets]);

  useEffect(() => {
    if (isLoading || didRestoreContext.current) {
      return;
    }

    didRestoreContext.current = true;
    const context = persistedContext.current;
    if (!context) {
      return;
    }

    const hasExplicitStep = new URLSearchParams(window.location.search).has("step");
    const canRestoreStep = context.step === "library" || assets.length > 0;
    if (!hasExplicitStep && canRestoreStep && context.step !== currentStep) {
      void navigate({ search: { step: context.step } });
    }

    if (!assets.length) {
      return;
    }

    const assetIdSet = new Set(assets.map((asset) => asset.id));
    if (context.selectedAssetIds.length > 0) {
      const restoredSelection = applySelectionLimit(
        context.selectedAssetIds.filter((id) => assetIdSet.has(id)),
        MAX_STYLE_SELECTION
      );
      if (restoredSelection.ids.length > 0) {
        selectedAssetIdsRef.current = restoredSelection.ids;
        setSelectedAssetIds(restoredSelection.ids);
        didAutoSelect.current = true;
        if (restoredSelection.limited) {
          setSelectionNotice(`最多可选择 ${MAX_STYLE_SELECTION} 张素材。`);
        }
      }
    }

    if (context.activeAssetId && assetIdSet.has(context.activeAssetId)) {
      setActiveAssetId(context.activeAssetId);
    }

    if (context.selectedPresetId && presetById.has(context.selectedPresetId)) {
      setSelectedPresetId(context.selectedPresetId);
    }

    setIntensity(clampIntensity(context.intensity));
  }, [assets, currentStep, isLoading, navigate, presetById, setSelectedAssetIds]);

  useEffect(() => {
    if (!assets.length) {
      setActiveAssetId(null);
      return;
    }
    const exists = assets.some((asset) => asset.id === activeAssetId);
    if (!exists) {
      setActiveAssetId(assets[0]?.id ?? null);
    }
  }, [assets, activeAssetId]);

  useEffect(() => {
    if (!didRestoreContext.current || didAutoSelect.current) {
      return;
    }
    if (assets.length > 0 && selectedAssetIds.length === 0) {
      const limitedSelection = applySelectionLimit(
        assets.map((asset) => asset.id),
        MAX_STYLE_SELECTION
      );
      setSelectedAssetIds(limitedSelection.ids);
      if (limitedSelection.limited) {
        setSelectionNotice(`最多可选择 ${MAX_STYLE_SELECTION} 张素材。`);
      }
      didAutoSelect.current = true;
    }
  }, [assets, selectedAssetIds.length, setSelectedAssetIds]);

  useEffect(() => {
    const asset = assets.find((item) => item.id === activeAssetId);
    if (!asset) {
      return;
    }
    const fallbackPresetId = asset.presetId ?? basePresets[0]?.id ?? "";
    setSelectedPresetId(fallbackPresetId);
    if (typeof asset.intensity === "number") {
      setIntensity(asset.intensity);
    }
  }, [activeAssetId, assets]);

  const selectedSet = useMemo(() => new Set(selectedAssetIds), [selectedAssetIds]);
  const selectedAssets = useMemo(
    () => assets.filter((asset) => selectedSet.has(asset.id)),
    [assets, selectedSet]
  );

  const groupOptions = useMemo(() => {
    const groups = new Set<string>();
    assets.forEach((asset) => groups.add(asset.group ?? "未分组"));
    return Array.from(groups);
  }, [assets]);

  const normalizedSearch = searchText.trim().toLowerCase();
  const filteredAssets = useMemo(
    () =>
      assets.filter((asset) => {
        const group = asset.group ?? "未分组";
        if (selectedGroup !== "all" && group !== selectedGroup) {
          return false;
        }
        if (normalizedSearch && !asset.name.toLowerCase().includes(normalizedSearch)) {
          return false;
        }
        return true;
      }),
    [assets, normalizedSearch, selectedGroup]
  );
  const filteredAssetIds = useMemo(() => filteredAssets.map((asset) => asset.id), [filteredAssets]);
  const filteredSelectedCount = useMemo(
    () => filteredAssetIds.filter((assetId) => selectedSet.has(assetId)).length,
    [filteredAssetIds, selectedSet]
  );
  const allFilteredSelected =
    filteredAssets.length > 0 && filteredSelectedCount === filteredAssets.length;

  const activeAsset = useMemo(
    () => assets.find((asset) => asset.id === activeAssetId) ?? null,
    [assets, activeAssetId]
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

  const setSelectionWithLimit = useCallback(
    (assetIds: string[]) => {
      const limited = applySelectionLimit(assetIds, MAX_STYLE_SELECTION);
      selectedAssetIdsRef.current = limited.ids;
      setSelectedAssetIds(limited.ids);
      setSelectionNotice(limited.limited ? `最多可选择 ${MAX_STYLE_SELECTION} 张素材。` : null);
    },
    [setSelectedAssetIds]
  );

  const handleToggleAssetSelection = useCallback(
    (assetId: string) => {
      const next = toggleSelectionWithLimit(
        selectedAssetIdsRef.current,
        assetId,
        MAX_STYLE_SELECTION
      );
      selectedAssetIdsRef.current = next.ids;
      setSelectedAssetIds(next.ids);
      setSelectionNotice(next.limited ? `最多可选择 ${MAX_STYLE_SELECTION} 张素材。` : null);
    },
    [setSelectedAssetIds]
  );

  const handleSelectFilteredAssets = useCallback(() => {
    setSelectionWithLimit(filteredAssets.map((asset) => asset.id));
  }, [filteredAssets, setSelectionWithLimit]);

  const handleDeselectFilteredAssets = useCallback(() => {
    if (filteredAssets.length === 0) {
      return;
    }
    const filteredSet = new Set(filteredAssets.map((asset) => asset.id));
    const nextIds = selectedAssetIdsRef.current.filter((assetId) => !filteredSet.has(assetId));
    selectedAssetIdsRef.current = nextIds;
    setSelectedAssetIds(nextIds);
    setSelectionNotice(null);
  }, [filteredAssets, setSelectedAssetIds]);

  const handleToggleAllFilteredAssets = useCallback(() => {
    if (allFilteredSelected) {
      handleDeselectFilteredAssets();
      return;
    }
    handleSelectFilteredAssets();
  }, [allFilteredSelected, handleDeselectFilteredAssets, handleSelectFilteredAssets]);

  const handleImportResult = useCallback(
    (result: AddAssetsResult) => {
      if (result.added > 0) {
        setActiveAssetId(result.addedAssetIds[0] ?? null);
        setSelectionWithLimit([...selectedAssetIdsRef.current, ...result.addedAssetIds]);
      }
      if (result.added > 0 && result.failed === 0) {
        setImportNotice(`已导入 ${result.added} 张素材。`);
        return;
      }
      if (result.added > 0 && result.failed > 0) {
        setImportNotice(`已导入 ${result.added} 张，失败 ${result.failed} 张。`);
        return;
      }
      if (result.errors && result.errors.length > 0) {
        setImportNotice(`导入失败：${result.errors[0]}`);
        return;
      }
      setImportNotice("导入失败，请重试或更换文件。");
    },
    [setSelectionWithLimit]
  );

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (isImporting) {
        setImportNotice("正在导入，请稍候。");
        return;
      }
      if (!files || files.length === 0) {
        return;
      }
      const filtered = Array.from(files).filter((file) => isSupportedImportFile(file));
      if (filtered.length === 0) {
        setImportNotice("仅支持导入 JPG / PNG / WebP 图片。");
        return;
      }
      setSearchText("");
      setSelectedGroup("all");
      void addAssets(filtered)
        .then((result) => handleImportResult(result))
        .catch(() => {
          setImportNotice("导入失败，请重试或更换文件。");
        });
    },
    [addAssets, handleImportResult, isImporting]
  );

  const applyPreset = (presetId: string) => {
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
  };

  const handleIntensityChange = (value: number) => {
    setIntensity(value);
    if (!activeAsset) {
      return;
    }
    updateAsset(activeAsset.id, { intensity: value });
  };

  const updateAdjustmentValue = (key: keyof EditingAdjustments, value: number) => {
    if (!activeAsset || !activeAdjustments) {
      return;
    }
    updateAsset(activeAsset.id, {
      adjustments: {
        ...activeAdjustments,
        [key]: value,
      },
    });
  };

  const handleSaveCustomPreset = () => {
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
  };

  const {
    tasks,
    setTasks,
    exportPreviewItems,
    exportFeedback,
    handleExportAll,
    completedCount,
    progress,
    isExporting,
    dismissExportFeedback,
  } = useExport({
    assets,
    allPresets,
    activeAssetId,
    format,
    quality,
    maxDimension,
  });

  const totalSize = useMemo(() => assets.reduce((sum, asset) => sum + asset.size, 0), [assets]);
  const formatLabel = format === "original" ? "跟随原文件" : format === "png" ? "PNG" : "JPG";

  const stepIndex = WORKSPACE_STEPS.findIndex((item) => item.id === currentStep);

  useEffect(() => {
    if (isLoading) {
      return;
    }
    persistWorkspaceContext({
      step: currentStep,
      selectedAssetIds,
      activeAssetId,
      selectedPresetId,
      intensity: clampIntensity(intensity),
    });
  }, [activeAssetId, currentStep, intensity, isLoading, selectedAssetIds, selectedPresetId]);

  const setStep = (nextStep: WorkspaceStep) => {
    void navigate({ search: { step: nextStep } });
  };

  const openFineTunePage = () => {
    if (!activeAssetId) {
      return;
    }
    void navigate({
      to: "/editor",
      search: { assetId: activeAssetId, returnStep: currentStep },
    });
  };

  const targetSelection =
    selectedAssetIds.length > 0
      ? selectedAssetIds
      : applySelectionLimit(
          assets.map((asset) => asset.id),
          MAX_STYLE_SELECTION
        ).ids;

  const primaryAction = (() => {
    if (currentStep === "library") {
      return {
        label: assets.length > 0 ? "下一步：选风格" : "导入素材",
        action: () => {
          if (assets.length > 0) {
            setStep("style");
          } else {
            setIsLibraryOpen(true);
          }
        },
        disabled: false,
      };
    }
    if (currentStep === "style") {
      return {
        label: "下一步：导出",
        action: () => setStep("export"),
        disabled: assets.length === 0,
      };
    }
    return {
      label: isExporting ? "导出中" : "开始导出",
      action: handleExportAll,
      disabled: assets.length === 0 || isExporting,
    };
  })();

  return {
    WORKSPACE_STEPS,
    project,
    assets,
    isImporting,
    selectedAssetIds,
    clearAssetSelection,
    applyPresetToGroup,
    applyPresetToSelection,
    updateAsset,
    isDragging,
    setIsDragging,
    isLibraryOpen,
    setIsLibraryOpen,
    searchText,
    setSearchText,
    selectedGroup,
    setSelectedGroup,
    activeAssetId,
    setActiveAssetId,
    selectedPresetId,
    intensity,
    showOriginal,
    setShowOriginal,
    advancedOpen,
    setAdvancedOpen,
    customPresetName,
    setCustomPresetName,
    customPresets,
    tasks,
    setTasks,
    exportPreviewItems,
    format,
    setFormat,
    quality,
    setQuality,
    maxDimension,
    setMaxDimension,
    selectionNotice,
    importNotice,
    exportFeedback,
    allPresets,
    aiPresetCandidates,
    selectedSet,
    selectedAssets,
    groupOptions,
    filteredAssets,
    filteredSelectedCount,
    allFilteredSelected,
    activeAsset,
    activeRecommendedTopPresets,
    activeAdjustments,
    previewAdjustments,
    previewFilmProfile,
    handleToggleAssetSelection,
    handleToggleAllFilteredAssets,
    handleImportResult,
    handleFiles,
    applyPreset,
    handleIntensityChange,
    updateAdjustmentValue,
    handleSaveCustomPreset,
    totalSize,
    formatLabel,
    currentStep,
    stepIndex,
    setStep,
    openFineTunePage,
    targetSelection,
    primaryAction,
    completedCount,
    progress,
    dismissExportFeedback,
  };
};
