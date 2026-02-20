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
import { renderImageToBlob } from "@/lib/imageProcessing";
import { useProjectStore, type AddAssetsResult } from "@/stores/projectStore";
import { useShallow } from "zustand/react/shallow";
import type { AiPresetRecommendation, EditingAdjustments, Preset } from "@/types";
import type {
  ExportPreviewItem,
  ExportTask,
  WorkspaceStep,
} from "../types";
import { WORKSPACE_STEPS, isSupportedImportFile } from "../constants";
import {
  buildCustomAdjustments,
  loadCustomPresets,
  persistCustomPresets,
  resolveAdjustments,
  resolveFilmProfile,
} from "../utils";

const WORKSPACE_CONTEXT_KEY = "filmlab.workspace.context";

interface PersistedWorkspaceContext {
  step: WorkspaceStep;
  selectedAssetIds: string[];
  activeAssetId: string | null;
  selectedPresetId: string;
  intensity: number;
}

interface ExportFeedback {
  kind: "success" | "mixed" | "error";
  title: string;
  detail: string;
}

interface FileWritableLike {
  write: (data: Blob) => Promise<void>;
  close: () => Promise<void>;
}

interface FileHandleLike {
  createWritable: () => Promise<FileWritableLike>;
}

interface DirectoryHandleLike {
  getFileHandle: (
    name: string,
    options: { create: boolean },
  ) => Promise<FileHandleLike>;
}

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options?: {
    id?: string;
    mode?: "read" | "readwrite";
    startIn?: "downloads" | "documents" | "desktop" | "pictures";
  }) => Promise<DirectoryHandleLike>;
};

const EXPORT_DIRECTORY_PICKER_ID = "filmlab-export-directory";

const clampIntensity = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const loadWorkspaceContext = (): PersistedWorkspaceContext | null => {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(WORKSPACE_CONTEXT_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<PersistedWorkspaceContext>;
    const step = parsed.step;
    if (step !== "library" && step !== "style" && step !== "export") {
      return null;
    }
    return {
      step,
      selectedAssetIds: Array.isArray(parsed.selectedAssetIds)
        ? parsed.selectedAssetIds.filter((id): id is string => typeof id === "string")
        : [],
      activeAssetId: typeof parsed.activeAssetId === "string" ? parsed.activeAssetId : null,
      selectedPresetId:
        typeof parsed.selectedPresetId === "string" ? parsed.selectedPresetId : "",
      intensity:
        typeof parsed.intensity === "number" ? clampIntensity(parsed.intensity) : 60,
    };
  } catch {
    return null;
  }
};

const persistWorkspaceContext = (context: PersistedWorkspaceContext) => {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(WORKSPACE_CONTEXT_KEY, JSON.stringify(context));
  } catch {
    // no-op
  }
};

const isAbortError = (error: unknown) =>
  error instanceof DOMException && error.name === "AbortError";

const supportsDirectoryExport = () => {
  if (typeof window === "undefined") {
    return false;
  }
  const pickerWindow = window as DirectoryPickerWindow;
  return typeof pickerWindow.showDirectoryPicker === "function";
};

const sanitizeFileName = (name: string) => {
  const sanitized = name
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/[. ]+$/g, "")
    .trim();
  return sanitized.length > 0 ? sanitized : "exported-image.jpg";
};

const toUniqueFileName = (name: string, usedNames: Set<string>) => {
  const safeName = sanitizeFileName(name);
  const dotIndex = safeName.lastIndexOf(".");
  const baseName = dotIndex > 0 ? safeName.slice(0, dotIndex) : safeName;
  const extension = dotIndex > 0 ? safeName.slice(dotIndex) : "";
  let candidate = safeName;
  let suffix = 2;
  while (usedNames.has(candidate)) {
    candidate = `${baseName} (${suffix})${extension}`;
    suffix += 1;
  }
  usedNames.add(candidate);
  return candidate;
};

const openExportDirectory = async (): Promise<DirectoryHandleLike | null> => {
  if (!supportsDirectoryExport()) {
    return null;
  }
  const pickerWindow = window as DirectoryPickerWindow;
  if (!pickerWindow.showDirectoryPicker) {
    return null;
  }
  try {
    return await pickerWindow.showDirectoryPicker({
      id: EXPORT_DIRECTORY_PICKER_ID,
      mode: "readwrite",
      startIn: "downloads",
    });
  } catch (error) {
    if (isAbortError(error)) {
      return null;
    }
    throw error;
  }
};

const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};

const writeBlobToDirectory = async (
  directoryHandle: DirectoryHandleLike,
  fileName: string,
  blob: Blob,
) => {
  const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
};

export const useWorkspaceState = () => {
  const navigate = useNavigate({ from: "/" });
  const { step } = useSearch({ from: "/" });
  const currentStep: WorkspaceStep =
    step === "style" || step === "export" ? step : "library";
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
    })),
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
  const [tasks, setTasks] = useState<ExportTask[]>([]);
  const [format, setFormat] = useState<"original" | "jpeg" | "png">("original");
  const [quality, setQuality] = useState(92);
  const [maxDimension, setMaxDimension] = useState(0);
  const [selectionNotice, setSelectionNotice] = useState<string | null>(null);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const [exportFeedback, setExportFeedback] = useState<ExportFeedback | null>(null);

  const didAutoSelect = useRef(false);
  const didRestoreContext = useRef(false);
  const persistedContext = useRef<PersistedWorkspaceContext | null>(
    loadWorkspaceContext(),
  );
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
    [customPresets],
  );
  const presetById = useMemo(
    () => new Map(allPresets.map((preset) => [preset.id, preset])),
    [allPresets],
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
    [allPresets, customPresetIdSet],
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
        MAX_STYLE_SELECTION,
      );
      if (restoredSelection.ids.length > 0) {
        selectedAssetIdsRef.current = restoredSelection.ids;
        setSelectedAssetIds(restoredSelection.ids);
        didAutoSelect.current = true;
        if (restoredSelection.limited) {
          setSelectionNotice(`Selection limited to ${MAX_STYLE_SELECTION} assets.`);
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
  }, [
    assets,
    currentStep,
    isLoading,
    navigate,
    presetById,
    setSelectedAssetIds,
  ]);

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
        MAX_STYLE_SELECTION,
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
    [assets, selectedSet],
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
    [assets, normalizedSearch, selectedGroup],
  );
  const filteredAssetIds = useMemo(
    () => filteredAssets.map((asset) => asset.id),
    [filteredAssets],
  );
  const filteredSelectedCount = useMemo(
    () => filteredAssetIds.filter((assetId) => selectedSet.has(assetId)).length,
    [filteredAssetIds, selectedSet],
  );
  const allFilteredSelected =
    filteredAssets.length > 0 && filteredSelectedCount === filteredAssets.length;

  const activeAsset = useMemo(
    () => assets.find((asset) => asset.id === activeAssetId) ?? null,
    [assets, activeAssetId],
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
        (
          item,
        ): item is { preset: Preset; recommendation: AiPresetRecommendation } =>
          item !== null,
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
      allPresets,
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
      activeAsset.filmOverrides,
    );
  }, [activeAsset, allPresets, previewAdjustments]);

  const setSelectionWithLimit = useCallback(
    (assetIds: string[]) => {
      const limited = applySelectionLimit(assetIds, MAX_STYLE_SELECTION);
      selectedAssetIdsRef.current = limited.ids;
      setSelectedAssetIds(limited.ids);
      setSelectionNotice(
        limited.limited ? `最多可选择 ${MAX_STYLE_SELECTION} 张素材。` : null,
      );
    },
    [setSelectedAssetIds],
  );

  const handleToggleAssetSelection = useCallback(
    (assetId: string) => {
      const next = toggleSelectionWithLimit(
        selectedAssetIdsRef.current,
        assetId,
        MAX_STYLE_SELECTION,
      );
      selectedAssetIdsRef.current = next.ids;
      setSelectedAssetIds(next.ids);
      setSelectionNotice(next.limited ? `最多可选择 ${MAX_STYLE_SELECTION} 张素材。` : null);
    },
    [setSelectedAssetIds],
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
        setSelectionWithLimit([
          ...selectedAssetIdsRef.current,
          ...result.addedAssetIds,
        ]);
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
    [setSelectionWithLimit],
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
    [addAssets, handleImportResult, isImporting],
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

  const resolveOutputType = (assetType: string) => {
    if (format === "png") {
      return "image/png";
    }
    if (format === "jpeg") {
      return "image/jpeg";
    }
    return assetType === "image/png" ? "image/png" : "image/jpeg";
  };

  const buildDownloadName = (name: string, type: string) => {
    const base = name.replace(/\.[^/.]+$/, "");
    const extension = type === "image/png" ? ".png" : ".jpg";
    if (format === "original") {
      return name;
    }
    return `${base}${extension}`;
  };

  const handleExportAll = async () => {
    if (assets.length === 0) {
      return;
    }
    setExportFeedback(null);
    const canPickDirectory = supportsDirectoryExport();
    let directoryHandle: DirectoryHandleLike | null = null;
    if (canPickDirectory) {
      try {
        directoryHandle = await openExportDirectory();
      } catch {
        setExportFeedback({
          kind: "error",
          title: "Export failed",
          detail: "Could not access the selected folder. Please retry.",
        });
        return;
      }
      if (!directoryHandle) {
        return;
      }
    }
    const newTasks = assets.map((asset) => ({
      id: asset.id,
      name: asset.name,
      status: "等待" as const,
    }));
    setTasks(newTasks);
    let successCount = 0;
    let failedCount = 0;
    const usedFileNames = new Set<string>();

    for (const asset of assets) {
      setTasks((prev) =>
        prev.map((item) =>
          item.id === asset.id ? { ...item, status: "处理中" } : item,
        ),
      );
      try {
        if (!asset?.blob) {
          throw new Error("缺少原图数据");
        }
        const adjustments = resolveAdjustments(
          asset.adjustments,
          asset.presetId,
          asset.intensity,
          allPresets,
        );
        const filmProfile = resolveFilmProfile(
          adjustments,
          asset.presetId,
          asset.filmProfileId,
          asset.filmProfile,
          asset.intensity,
          allPresets,
          asset.filmOverrides,
        );
        const outputType = resolveOutputType(asset.type);
        const blob = await renderImageToBlob(asset.blob, adjustments, {
          type: outputType,
          quality: quality / 100,
          maxDimension: maxDimension > 0 ? maxDimension : undefined,
          filmProfile: filmProfile ?? undefined,
          seedKey: asset.id,
        });
        const outputFileName = toUniqueFileName(
          buildDownloadName(asset.name, outputType),
          usedFileNames,
        );
        if (directoryHandle) {
          await writeBlobToDirectory(directoryHandle, outputFileName, blob);
        } else {
          downloadBlob(blob, outputFileName);
        }
        successCount += 1;
        setTasks((prev) =>
          prev.map((item) =>
            item.id === asset.id ? { ...item, status: "完成" } : item,
          ),
        );
      } catch {
        failedCount += 1;
        setTasks((prev) =>
          prev.map((item) =>
            item.id === asset.id ? { ...item, status: "失败" } : item,
          ),
        );
      }
    }

    if (failedCount === 0) {
      setExportFeedback({
        kind: "success",
        title: "导出完成",
        detail: `已成功导出 ${successCount} 张图片。`,
      });
      return;
    }

    if (successCount === 0) {
      setExportFeedback({
        kind: "error",
        title: "导出失败",
        detail: "所有图片导出失败，请调整参数后重试。",
      });
      return;
    }

    setExportFeedback({
      kind: "mixed",
      title: "导出已完成（部分失败）",
      detail: `成功 ${successCount} 张，失败 ${failedCount} 张。`,
    });
  };

  const completedCount = tasks.filter((task) => task.status === "完成").length;
  const progress = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;
  const isExporting = tasks.some((task) => task.status === "处理中");
  const taskStatusById = useMemo(
    () => new Map(tasks.map((task) => [task.id, task.status])),
    [tasks],
  );
  const exportPreviewItems = useMemo<ExportPreviewItem[]>(
    () =>
      assets.map((asset) => ({
        assetId: asset.id,
        name: asset.name,
        thumbnailUrl: asset.thumbnailUrl ?? asset.objectUrl,
        status: taskStatusById.get(asset.id) ?? "未开始",
        isActive: asset.id === activeAssetId,
      })),
    [activeAssetId, assets, taskStatusById],
  );

  const totalSize = useMemo(
    () => assets.reduce((sum, asset) => sum + asset.size, 0),
    [assets],
  );
  const formatLabel =
    format === "original" ? "跟随原文件" : format === "png" ? "PNG" : "JPG";

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
  }, [
    activeAssetId,
    currentStep,
    intensity,
    isLoading,
    selectedAssetIds,
    selectedPresetId,
  ]);

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
          MAX_STYLE_SELECTION,
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

  const dismissExportFeedback = () => {
    setExportFeedback(null);
  };

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
