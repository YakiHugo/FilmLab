import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { presets as basePresets } from "@/data/presets";
import {
  MAX_STYLE_SELECTION,
  applySelectionLimit,
} from "@/lib/ai/recommendationUtils";
import { useProjectStore } from "@/stores/projectStore";
import { useShallow } from "zustand/react/shallow";
import type { WorkspaceStep } from "../types";
import { WORKSPACE_STEPS } from "../constants";
import {
  clampIntensity,
  loadWorkspaceContext,
  persistWorkspaceContext,
  type PersistedWorkspaceContext,
} from "./exportHelpers";
import { useExport } from "./useExport";
import { useWorkspaceFiltering } from "./useWorkspaceFiltering";
import { useWorkspacePresets } from "./useWorkspacePresets";
import { useWorkspaceSelection } from "./useWorkspaceSelection";

export const useWorkspaceState = () => {
  const navigate = useNavigate({ from: "/" });
  const { step } = useSearch({ from: "/" });
  const currentStep: WorkspaceStep = step === "style" || step === "export" ? step : "library";

  const {
    project,
    assets,
    isLoading,
    applyPresetToGroup,
    applyPresetToSelection,
    updateAsset,
  } = useProjectStore(
    useShallow((state) => ({
      project: state.project,
      assets: state.assets,
      isLoading: state.isLoading,
      applyPresetToGroup: state.applyPresetToGroup,
      applyPresetToSelection: state.applyPresetToSelection,
      updateAsset: state.updateAsset,
    }))
  );

  // --- UI state ---
  const [isDragging, setIsDragging] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [format, setFormat] = useState<"original" | "jpeg" | "png">("original");
  const [quality, setQuality] = useState(92);
  const [maxDimension, setMaxDimension] = useState(0);
  const [activeAssetId, setActiveAssetId] = useState<string | null>(null);

  // --- Sub-hooks ---
  const selection = useWorkspaceSelection();
  const filtering = useWorkspaceFiltering(assets);
  const activeAsset = useMemo(
    () => assets.find((asset) => asset.id === activeAssetId) ?? null,
    [assets, activeAssetId]
  );
  const presets = useWorkspacePresets({ activeAsset, updateAsset });

  // --- Import notice auto-dismiss ---
  useEffect(() => {
    if (!selection.importNotice) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      selection.setImportNotice(null);
    }, 2800);
    return () => window.clearTimeout(timer);
  }, [selection.importNotice, selection.setImportNotice]);

  // --- Context restore ---
  const didAutoSelect = useRef(false);
  const didRestoreContext = useRef(false);
  const persistedContext = useRef<PersistedWorkspaceContext | null>(loadWorkspaceContext());

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
        selection.setSelectionWithLimit(restoredSelection.ids);
        didAutoSelect.current = true;
      }
    }

    if (context.activeAssetId && assetIdSet.has(context.activeAssetId)) {
      setActiveAssetId(context.activeAssetId);
    }

    if (context.selectedPresetId && presets.presetById.has(context.selectedPresetId)) {
      presets.setSelectedPresetId(context.selectedPresetId);
    }

    presets.setIntensity(clampIntensity(context.intensity));
  }, [assets, currentStep, isLoading, navigate, presets.presetById, selection.setSelectionWithLimit, presets.setSelectedPresetId, presets.setIntensity]);

  // --- Keep activeAssetId valid ---
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

  // --- Auto-select all on first load ---
  useEffect(() => {
    if (!didRestoreContext.current || didAutoSelect.current) {
      return;
    }
    if (assets.length > 0 && selection.selectedAssetIds.length === 0) {
      selection.setSelectionWithLimit(assets.map((asset) => asset.id));
      didAutoSelect.current = true;
    }
  }, [assets, selection.selectedAssetIds.length, selection.setSelectionWithLimit]);

  // --- Sync preset/intensity when active asset changes ---
  useEffect(() => {
    const asset = assets.find((item) => item.id === activeAssetId);
    if (!asset) {
      return;
    }
    const fallbackPresetId = asset.presetId ?? basePresets[0]?.id ?? "";
    presets.setSelectedPresetId(fallbackPresetId);
    if (typeof asset.intensity === "number") {
      presets.setIntensity(asset.intensity);
    }
  }, [activeAssetId, assets, presets.setIntensity, presets.setSelectedPresetId]);

  // --- Derived selection data ---
  const selectedSet = useMemo(() => new Set(selection.selectedAssetIds), [selection.selectedAssetIds]);
  const selectedAssets = useMemo(
    () => assets.filter((asset) => selectedSet.has(asset.id)),
    [assets, selectedSet]
  );
  const filteredAssetIds = useMemo(
    () => filtering.filteredAssets.map((asset) => asset.id),
    [filtering.filteredAssets]
  );
  const filteredSelectedCount = useMemo(
    () => filteredAssetIds.filter((assetId) => selectedSet.has(assetId)).length,
    [filteredAssetIds, selectedSet]
  );
  const allFilteredSelected =
    filtering.filteredAssets.length > 0 && filteredSelectedCount === filtering.filteredAssets.length;

  // --- Bridged handlers ---
  const handleToggleAllFilteredAssets = useCallback(() => {
    selection.handleToggleAllFilteredAssets(filtering.filteredAssets, allFilteredSelected);
  }, [selection.handleToggleAllFilteredAssets, filtering.filteredAssets, allFilteredSelected]);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      selection.handleFiles(files, filtering.resetFilters);
    },
    [selection.handleFiles, filtering.resetFilters]
  );

  const handleImportResult = useCallback(
    (result: Parameters<typeof selection.handleImportResult>[0]) => {
      if (result.added > 0) {
        setActiveAssetId(result.addedAssetIds[0] ?? null);
      }
      selection.handleImportResult(result);
    },
    [selection.handleImportResult]
  );

  // --- Export ---
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
    allPresets: presets.allPresets,
    activeAssetId,
    format,
    quality,
    maxDimension,
  });

  const totalSize = useMemo(() => assets.reduce((sum, asset) => sum + asset.size, 0), [assets]);
  const formatLabel = format === "original" ? "跟随原文件" : format === "png" ? "PNG" : "JPG";

  // --- Navigation ---
  const stepIndex = WORKSPACE_STEPS.findIndex((item) => item.id === currentStep);

  const setStep = useCallback(
    (nextStep: WorkspaceStep) => {
      void navigate({ search: { step: nextStep } });
    },
    [navigate]
  );

  const openFineTunePage = useCallback(() => {
    if (!activeAssetId) {
      return;
    }
    void navigate({
      to: "/editor",
      search: { assetId: activeAssetId, returnStep: currentStep },
    });
  }, [activeAssetId, currentStep, navigate]);

  const targetSelection = useMemo(
    () =>
      selection.selectedAssetIds.length > 0
        ? selection.selectedAssetIds
        : applySelectionLimit(
            assets.map((asset) => asset.id),
            MAX_STYLE_SELECTION
          ).ids,
    [assets, selection.selectedAssetIds]
  );

  const primaryAction = useMemo(() => {
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
  }, [assets.length, currentStep, handleExportAll, isExporting, setStep]);

  // --- Persist workspace context ---
  useEffect(() => {
    if (isLoading) {
      return;
    }
    persistWorkspaceContext({
      step: currentStep,
      selectedAssetIds: selection.selectedAssetIds,
      activeAssetId,
      selectedPresetId: presets.selectedPresetId,
      intensity: clampIntensity(presets.intensity),
    });
  }, [activeAssetId, currentStep, presets.intensity, isLoading, selection.selectedAssetIds, presets.selectedPresetId]);

  // --- Return the same shape as before ---
  return {
    WORKSPACE_STEPS,
    project,
    assets,
    isImporting: selection.isImporting,
    selectedAssetIds: selection.selectedAssetIds,
    clearAssetSelection: selection.clearAssetSelection,
    applyPresetToGroup,
    applyPresetToSelection,
    updateAsset,
    isDragging,
    setIsDragging,
    isLibraryOpen,
    setIsLibraryOpen,
    searchText: filtering.searchText,
    setSearchText: filtering.setSearchText,
    selectedGroup: filtering.selectedGroup,
    setSelectedGroup: filtering.setSelectedGroup,
    activeAssetId,
    setActiveAssetId,
    selectedPresetId: presets.selectedPresetId,
    intensity: presets.intensity,
    showOriginal,
    setShowOriginal,
    advancedOpen: presets.advancedOpen,
    setAdvancedOpen: presets.setAdvancedOpen,
    customPresetName: presets.customPresetName,
    setCustomPresetName: presets.setCustomPresetName,
    customPresets: presets.customPresets,
    tasks,
    setTasks,
    exportPreviewItems,
    format,
    setFormat,
    quality,
    setQuality,
    maxDimension,
    setMaxDimension,
    selectionNotice: selection.selectionNotice,
    importNotice: selection.importNotice,
    exportFeedback,
    allPresets: presets.allPresets,
    aiPresetCandidates: presets.aiPresetCandidates,
    selectedSet,
    selectedAssets,
    groupOptions: filtering.groupOptions,
    filteredAssets: filtering.filteredAssets,
    filteredSelectedCount,
    allFilteredSelected,
    activeAsset,
    activeRecommendedTopPresets: presets.activeRecommendedTopPresets,
    activeAdjustments: presets.activeAdjustments,
    previewAdjustments: presets.previewAdjustments,
    previewFilmProfile: presets.previewFilmProfile,
    handleToggleAssetSelection: selection.handleToggleAssetSelection,
    handleToggleAllFilteredAssets,
    handleImportResult,
    handleFiles,
    applyPreset: presets.applyPreset,
    handleIntensityChange: presets.handleIntensityChange,
    updateAdjustmentValue: presets.updateAdjustmentValue,
    handleSaveCustomPreset: presets.handleSaveCustomPreset,
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
