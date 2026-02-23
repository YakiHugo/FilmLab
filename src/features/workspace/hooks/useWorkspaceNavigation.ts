import { useCallback, useEffect, useMemo, useRef } from "react";
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

interface UseWorkspaceNavigationOptions {
  activeAssetId: string | null;
  setActiveAssetId: (id: string | null) => void;
  selectedPresetId: string;
  setSelectedPresetId: (id: string) => void;
  intensity: number;
  setIntensity: (value: number) => void;
  presetById: Map<string, unknown>;
  setIsLibraryOpen: (open: boolean) => void;
  isExporting: boolean;
  handleExportAll: () => void;
}

export function useWorkspaceNavigation({
  activeAssetId,
  setActiveAssetId,
  selectedPresetId,
  setSelectedPresetId,
  intensity,
  setIntensity,
  presetById,
  setIsLibraryOpen,
  isExporting,
  handleExportAll,
}: UseWorkspaceNavigationOptions) {
  const navigate = useNavigate({ from: "/" });
  const { step } = useSearch({ from: "/" });
  const currentStep: WorkspaceStep = step === "style" || step === "export" ? step : "library";

  const {
    assets,
    isLoading,
    selectedAssetIds,
    setSelectedAssetIds,
  } = useProjectStore(
    useShallow((state) => ({
      assets: state.assets,
      isLoading: state.isLoading,
      selectedAssetIds: state.selectedAssetIds,
      setSelectedAssetIds: state.setSelectedAssetIds,
    }))
  );

  const didAutoSelect = useRef(false);
  const didRestoreContext = useRef(false);
  const persistedContext = useRef<PersistedWorkspaceContext | null>(loadWorkspaceContext());

  // Restore workspace context from localStorage on first load
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
        setSelectedAssetIds(restoredSelection.ids);
        didAutoSelect.current = true;
      }
    }

    if (context.activeAssetId && assetIdSet.has(context.activeAssetId)) {
      setActiveAssetId(context.activeAssetId);
    }

    if (context.selectedPresetId && presetById.has(context.selectedPresetId)) {
      setSelectedPresetId(context.selectedPresetId);
    }

    setIntensity(clampIntensity(context.intensity));
  }, [assets, currentStep, isLoading, navigate, presetById, setActiveAssetId, setIntensity, setSelectedAssetIds, setSelectedPresetId]);

  // Ensure activeAssetId always points to an existing asset
  useEffect(() => {
    if (!assets.length) {
      setActiveAssetId(null);
      return;
    }
    const exists = assets.some((asset) => asset.id === activeAssetId);
    if (!exists) {
      setActiveAssetId(assets[0]?.id ?? null);
    }
  }, [assets, activeAssetId, setActiveAssetId]);

  // Auto-select all assets on first load if no selection was restored
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
      didAutoSelect.current = true;
    }
  }, [assets, selectedAssetIds.length, setSelectedAssetIds]);

  // Sync preset/intensity when active asset changes
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
  }, [activeAssetId, assets, setIntensity, setSelectedPresetId]);

  // Persist workspace context to localStorage
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
      selectedAssetIds.length > 0
        ? selectedAssetIds
        : applySelectionLimit(
            assets.map((asset) => asset.id),
            MAX_STYLE_SELECTION
          ).ids,
    [assets, selectedAssetIds]
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
  }, [assets.length, currentStep, handleExportAll, isExporting, setIsLibraryOpen, setStep]);

  return {
    currentStep,
    stepIndex,
    setStep,
    openFineTunePage,
    targetSelection,
    primaryAction,
  };
}
